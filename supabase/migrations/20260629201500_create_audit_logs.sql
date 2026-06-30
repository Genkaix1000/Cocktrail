-- Create audit_logs table
CREATE TABLE IF NOT EXISTS audit_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action      TEXT NOT NULL,
  description TEXT NOT NULL,
  operator    TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs (created_at DESC);

-- Grant privileges to Supabase API roles
GRANT ALL PRIVILEGES ON TABLE audit_logs TO postgres, anon, authenticated, service_role;
