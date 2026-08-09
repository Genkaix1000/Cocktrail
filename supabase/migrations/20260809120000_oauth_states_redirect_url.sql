-- F0+F1: redirect del callback OAuth por entorno (local vs prod).
-- MP solo devuelve code+state; el frontend destino viaja en oauth_states.

ALTER TABLE oauth_states ADD COLUMN IF NOT EXISTS redirect_url TEXT;

-- OUT params distintos → hay que dropear antes (CREATE OR REPLACE no cambia el row type).
DROP FUNCTION IF EXISTS consume_oauth_state(TEXT);

CREATE FUNCTION consume_oauth_state(p_state TEXT)
RETURNS TABLE(code_verifier TEXT, bar_id TEXT, redirect_url TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  DELETE FROM oauth_states
  WHERE oauth_states.state = p_state AND oauth_states.expires_at > NOW()
  RETURNING oauth_states.code_verifier, oauth_states.bar_id, oauth_states.redirect_url;
END;
$$;

REVOKE EXECUTE ON FUNCTION consume_oauth_state(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION consume_oauth_state(TEXT) TO service_role;
