-- 20260720000000_bar_sessions.sql
-- Sesiones de caja por barra. 1 sola sesión por barra, 1 usuario no puede estar en 2 barras.

CREATE TABLE IF NOT EXISTS bar_sessions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bar_id       UUID NOT NULL REFERENCES bars(id) ON DELETE CASCADE,
  -- Identidad estable "rol:username". También cubre los usuarios fallback de .env.
  user_id      TEXT NOT NULL,
  username     TEXT NOT NULL,
  role         TEXT NOT NULL CHECK (role IN ('caja', 'admin')),
  connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (bar_id),       -- 1 sola sesión por barra
  UNIQUE (user_id)       -- 1 usuario no puede estar en 2 barras
);

-- Compatibilidad si la tabla se creó manualmente antes de aplicar esta migración.
ALTER TABLE bar_sessions
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_bar_sessions_last_seen_at
  ON bar_sessions(last_seen_at);

-- Tabla operativa de uso exclusivo del backend.
ALTER TABLE bar_sessions ENABLE ROW LEVEL SECURITY;
GRANT ALL PRIVILEGES ON TABLE bar_sessions TO postgres, service_role;
REVOKE ALL PRIVILEGES ON TABLE bar_sessions FROM anon, authenticated;
