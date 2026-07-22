-- 20260723000100_seller_handoff.sql
-- PR 4: buzón de traspaso del OAuth. La Edge Function (Cloud) deposita acá el
-- payload de tokens CIFRADO con MP_HANDOFF_KEY (contrato "cocktrail/mp-handoff/v1");
-- el backend local hace pull, descifra, re-cifra local y BORRA la fila.
-- Los tokens jamás quedan en claro en ninguna base (D3).
-- Esta tabla vive en Cloud (el mismo DDL va en docs/specs/mercadopago/sql/pr4-cloud.sql);
-- se migra también en local para que el esquema sea espejo y los tests la vean.

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

-- Denegación dura (42501) además del RLS: en Supabase los DEFAULT PRIVILEGES
-- otorgan ALL a anon/authenticated en cada tabla nueva.
REVOKE ALL PRIVILEGES ON TABLE mercadopago_seller_handoff FROM anon, authenticated;
