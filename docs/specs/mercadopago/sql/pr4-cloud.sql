-- pr4-cloud.sql — PR 4, lado Cloud. Pegar entero en el SQL Editor y ejecutar UNA vez.
-- Idempotente. ⚠ El paso 2 purga los tokens: punto de no retorno (salida: re-vincular por OAuth).

-- 1) Buzón de traspaso del OAuth (la Edge Function deposita el token cifrado; el backend lo consume)
CREATE TABLE IF NOT EXISTS mercadopago_seller_handoff (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     TEXT NOT NULL,
  payload_enc TEXT NOT NULL,
  key_version SMALLINT NOT NULL DEFAULT 1,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '15 minutes'
);

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
REVOKE ALL PRIVILEGES ON TABLE mercadopago_seller_handoff FROM anon, authenticated;

-- 2) Purga de tokens en claro + expirar ambos sellers (⚠ PUNTO DE NO RETORNO)
UPDATE mercadopago_sellers
SET access_token  = NULL,
    refresh_token = NULL,
    status        = 'expired',
    updated_at    = NOW()
WHERE user_id IN ('1517393956', '225043369');

-- 3) Invariante single-seller (requiere el paso 2 ya ejecutado)
CREATE UNIQUE INDEX IF NOT EXISTS mercadopago_sellers_one_active
  ON mercadopago_sellers ((1))
  WHERE status = 'active';
