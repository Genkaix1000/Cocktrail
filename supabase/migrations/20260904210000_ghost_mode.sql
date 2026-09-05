-- Ghost mode: flag global + seller OAuth paralelo (status=ghost) + purpose en oauth_states.

CREATE TABLE IF NOT EXISTS system_flags (
  key         TEXT PRIMARY KEY,
  value       BOOLEAN NOT NULL DEFAULT false,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by  TEXT
);

ALTER TABLE system_flags ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_policies
    WHERE policyname = 'system_flags_service_role_only'
      AND tablename = 'system_flags'
  ) THEN
    CREATE POLICY system_flags_service_role_only
      ON system_flags
      FOR ALL
      TO authenticated, anon
      USING (false);
  END IF;
END $$;

GRANT ALL PRIVILEGES ON TABLE system_flags TO postgres, service_role;
REVOKE ALL PRIVILEGES ON TABLE system_flags FROM anon, authenticated;

INSERT INTO system_flags (key, value)
VALUES ('ghost_mode', false)
ON CONFLICT (key) DO NOTHING;

-- Seller ghost en paralelo al active (el índice one_active no lo toca).
ALTER TABLE mercadopago_sellers DROP CONSTRAINT IF EXISTS mercadopago_sellers_status_check;
ALTER TABLE mercadopago_sellers
  ADD CONSTRAINT mercadopago_sellers_status_check
  CHECK (status IN ('active', 'expired', 'ghost'));

CREATE UNIQUE INDEX IF NOT EXISTS mercadopago_sellers_one_ghost
  ON mercadopago_sellers ((1))
  WHERE status = 'ghost';

-- OAuth purpose: primary (default) | ghost
ALTER TABLE oauth_states ADD COLUMN IF NOT EXISTS purpose TEXT NOT NULL DEFAULT 'primary';

DROP FUNCTION IF EXISTS consume_oauth_state(TEXT);

CREATE FUNCTION consume_oauth_state(p_state TEXT)
RETURNS TABLE(code_verifier TEXT, bar_id TEXT, redirect_url TEXT, purpose TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  DELETE FROM oauth_states
  WHERE oauth_states.state = p_state AND oauth_states.expires_at > NOW()
  RETURNING
    oauth_states.code_verifier,
    oauth_states.bar_id,
    oauth_states.redirect_url,
    oauth_states.purpose;
END;
$$;

REVOKE EXECUTE ON FUNCTION consume_oauth_state(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION consume_oauth_state(TEXT) TO service_role;
