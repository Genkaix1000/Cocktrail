-- 20260723000000_sellers_encrypted_tokens.sql
-- PR 4: el seller pasa a vivir en la base LOCAL con tokens cifrados (AES-256-GCM,
-- contrato "cocktrail/mp-token/v1", ver mp-token-cipher.ts). Las columnas en
-- claro (access_token/refresh_token) NO se dropean todavía: el backfill del boot
-- las lee una última vez (key_version NULL = texto claro legacy) y las pisa con
-- NULL. El drop queda diferido a un PR posterior.

ALTER TABLE IF EXISTS mercadopago_sellers ADD COLUMN IF NOT EXISTS access_token_enc  TEXT;
ALTER TABLE IF EXISTS mercadopago_sellers ADD COLUMN IF NOT EXISTS refresh_token_enc TEXT;
-- 1 = blob "v1." cifrado; NULL = texto claro legacy (tolerancia de backfill)
ALTER TABLE IF EXISTS mercadopago_sellers ADD COLUMN IF NOT EXISTS key_version       SMALLINT;
-- NULL = metadata pendiente de push a Cloud (el pusher es del PR 5)
ALTER TABLE IF EXISTS mercadopago_sellers ADD COLUMN IF NOT EXISTS cloud_synced_at   TIMESTAMPTZ;

-- Invariante single-seller: a lo sumo UNA fila con status='active'.
-- En LOCAL hay una sola fila activa, así que el índice aplica limpio.
-- ⚠ En CLOUD este índice va DESPUÉS del wipe de sellers (hoy hay 2 activos):
--   ver docs/specs/mercadopago/sql/pr4-cloud.sql, que lo crea en el orden correcto.
CREATE UNIQUE INDEX IF NOT EXISTS mercadopago_sellers_one_active
  ON mercadopago_sellers ((1))
  WHERE status = 'active';
