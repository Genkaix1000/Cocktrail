-- 20260715000100_mercadopago_sellers.sql
-- Tokens OAuth de cada vendedor (Bosko). Schema canónico: docs/mp/api-oauth.md.
-- Los tokens son SENSIBLES: solo el backend (service_role) puede leerlos/escribirlos.

CREATE TABLE IF NOT EXISTS mercadopago_sellers (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       TEXT NOT NULL UNIQUE,                      -- mp_user_id del vendedor (Bosko)
  access_token  TEXT NOT NULL,                             -- token OAuth activo
  refresh_token TEXT,                                      -- rotativo, un solo uso
  expires_at    TIMESTAMPTZ NOT NULL,                      -- fecha de expiración del token
  status        TEXT DEFAULT 'active'
                  CHECK (status IN ('active', 'expired')),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()                  -- se actualiza manualmente desde el backend en cada UPDATE
);

-- RLS: solo el backend (service_role, que tiene BYPASSRLS) puede leer/escribir tokens.
ALTER TABLE mercadopago_sellers ENABLE ROW LEVEL SECURITY;

-- Bloquea todo acceso desde el cliente (anon/authenticated).
CREATE POLICY sellers_service_role_only
  ON mercadopago_sellers
  FOR ALL
  TO authenticated, anon
  USING (false);

-- Least privilege: el backend usa service_role (bypassea RLS por diseño en Supabase).
GRANT ALL PRIVILEGES ON TABLE mercadopago_sellers TO postgres, service_role;

-- ⚠ En Supabase hay DEFAULT PRIVILEGES que otorgan ALL a anon/authenticated en
-- cada tabla nueva. Con RLS + USING(false) el cliente solo recibiría 0 filas (sin
-- error). Revocamos los privilegios de tabla para una denegación dura (42501):
-- los tokens quedan totalmente inaccesibles desde el cliente. RLS queda como
-- defensa en profundidad.
REVOKE ALL PRIVILEGES ON TABLE mercadopago_sellers FROM anon, authenticated;
