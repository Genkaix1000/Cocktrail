-- pr4-cloud.sql — PR 4: inversión del token + single-seller (LADO CLOUD)
-- ═══════════════════════════════════════════════════════════════════════════
-- Pegar ENTERO en el SQL Editor del dashboard de Supabase Cloud
-- (proyecto nmdvrmglmnbpoyfjmgab) y ejecutar UNA vez. Es idempotente:
-- re-ejecutarlo no rompe nada.
--
-- ⚠ NO usar `supabase db push` para esto: el esquema Cloud divergió a
--   propósito del local y push intentaría reconciliar todo.
--
-- Qué hace, EN ORDEN:
--   1) Crea el buzón de traspaso `mercadopago_seller_handoff` (+ RLS/REVOKE).
--   2) PURGA los tokens en claro de `mercadopago_sellers` y expira ambos
--      sellers. ⚠ PUNTO DE NO RETORNO.
--   3) Crea el índice único parcial single-seller (recién ejecutable
--      después del wipe: hoy hay 2 filas activas y fallaría antes).
-- ═══════════════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────────────
-- 1) Buzón de traspaso del OAuth
-- La Edge Function mp-auth-callback deposita acá el payload de tokens
-- CIFRADO con MP_HANDOFF_KEY (AES-256-GCM, contrato "cocktrail/mp-handoff/v1").
-- El backend local hace pull, descifra, re-cifra local y borra la fila.
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS mercadopago_seller_handoff (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     TEXT NOT NULL,                                -- mp_user_id del seller vinculado
  payload_enc TEXT NOT NULL,                                -- blob "v1.<salt>.<iv>.<ct||tag>" (b64url)
  key_version SMALLINT NOT NULL DEFAULT 1,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '15 minutes'
);

-- RLS deny-all: solo service_role (BYPASSRLS) toca el buzón.
ALTER TABLE mercadopago_seller_handoff ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_policies
    WHERE policyname = 'seller_handoff_deny_all'
      AND tablename = 'mercadopago_seller_handoff'
  ) THEN
    CREATE POLICY seller_handoff_deny_all
      ON mercadopago_seller_handoff
      FOR ALL
      TO authenticated, anon
      USING (false);
  END IF;
END $$;

GRANT ALL PRIVILEGES ON TABLE mercadopago_seller_handoff TO postgres, service_role;

-- Denegación dura (42501) además del RLS: los DEFAULT PRIVILEGES de Supabase
-- otorgan ALL a anon/authenticated en cada tabla nueva.
REVOKE ALL PRIVILEGES ON TABLE mercadopago_seller_handoff FROM anon, authenticated;


-- ───────────────────────────────────────────────────────────────────────────
-- 2) Saneamiento / purga de tokens en claro (R21/A17 + D3)
--
-- ⚠⚠ PUNTO DE NO RETORNO ⚠⚠
-- Los tokens NO se recuperan después de esto (D3: ningún token vuelve a
-- Cloud, nunca). La salida es re-vincular por OAuth desde /admin?tab=pagos,
-- que toma ~2 minutos y es a la vez la prueba viva del flujo nuevo.
-- Mientras tanto el cobro lo cubre el fallback F1 (MP_ACCESS_TOKEN del .env,
-- misma cuenta, preflight verificado).
--
-- Deja ambos sellers en 'expired': después de esto NO queda ninguna fila
-- activa, condición necesaria para el índice del paso 3.
-- ───────────────────────────────────────────────────────────────────────────

UPDATE mercadopago_sellers
SET access_token  = NULL,
    refresh_token = NULL,
    status        = 'expired',
    updated_at    = NOW()
WHERE user_id IN ('1517393956', '225043369');


-- ───────────────────────────────────────────────────────────────────────────
-- 3) Invariante single-seller: a lo sumo UNA fila con status='active'.
-- Recién ejecutable después del paso 2 (con 2 activos la creación fallaría
-- con unique_violation). El próximo re-link por OAuth crea el único activo;
-- la Edge Function expira a cualquier otro antes del upsert.
-- ───────────────────────────────────────────────────────────────────────────

CREATE UNIQUE INDEX IF NOT EXISTS mercadopago_sellers_one_active
  ON mercadopago_sellers ((1))
  WHERE status = 'active';
