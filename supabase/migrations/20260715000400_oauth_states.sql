-- 20260715000400_oauth_states.sql
-- Estado auxiliar del flujo OAuth (PKCE) con TTL de 10 minutos.
-- Schema canónico: docs/mp/api-oauth.md § "Tabla oauth_states".

CREATE TABLE IF NOT EXISTS oauth_states (
  state         TEXT PRIMARY KEY,
  code_verifier TEXT NOT NULL,
  bar_id        TEXT,                     -- Cocktrail-specific: saber qué barra inició el OAuth
  expires_at    TIMESTAMPTZ NOT NULL,     -- TTL 10 min
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- RPC atómica: lee, valida TTL, elimina — todo en un solo paso.
-- SECURITY DEFINER para que funcione desde roles con acceso limitado a la tabla.
-- ⚠ SET search_path fijo: sin esto, una función SECURITY DEFINER es vulnerable a
-- inyección de search_path (advisor 0011). Con search_path=public, pg_temp la
-- referencia a oauth_states resuelve siempre a public.oauth_states.
CREATE OR REPLACE FUNCTION consume_oauth_state(p_state TEXT)
RETURNS TABLE(code_verifier TEXT, bar_id TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  DELETE FROM oauth_states
  WHERE oauth_states.state = p_state AND oauth_states.expires_at > NOW()
  RETURNING oauth_states.code_verifier, oauth_states.bar_id;
END;
$$;

-- Solo el backend (service_role) puede ejecutar la RPC. Revocamos de PUBLIC y
-- explícitamente de anon/authenticated: en Supabase hay DEFAULT PRIVILEGES que
-- otorgan EXECUTE a esos roles en cada función nueva (advisors 0028/0029), y
-- REVOKE FROM PUBLIC no los alcanza.
REVOKE EXECUTE ON FUNCTION consume_oauth_state(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION consume_oauth_state(TEXT) TO service_role;

-- Tabla de uso exclusivo del backend (service_role). Guarda el code_verifier (PKCE):
-- least-privilege estricto. Se revocan los privilegios que los DEFAULT PRIVILEGES de
-- Supabase otorgan a anon/authenticated.
GRANT ALL PRIVILEGES ON TABLE oauth_states TO postgres, service_role;
REVOKE ALL PRIVILEGES ON TABLE oauth_states FROM anon, authenticated;
