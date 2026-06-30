-- 20240102000000_edge_sync.sql
-- Tablas maestras sincronizadas desde la Nube al Edge (Mini-PC)

-- users
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL,
  permissions JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- drinks
CREATE TABLE IF NOT EXISTS drinks (
  id INT PRIMARY KEY,
  name TEXT NOT NULL,
  price INT NOT NULL,
  description TEXT NOT NULL,
  vibe TEXT NOT NULL,
  flavors JSONB NOT NULL, -- array of strings
  icon_name TEXT NOT NULL,
  image TEXT,
  trending BOOLEAN NOT NULL DEFAULT FALSE,
  promo BOOLEAN NOT NULL DEFAULT FALSE,
  available BOOLEAN NOT NULL DEFAULT TRUE
);

-- app_config
CREATE TABLE IF NOT EXISTS app_config (
  id TEXT PRIMARY KEY DEFAULT 'default',
  theme TEXT NOT NULL DEFAULT 'normal',
  brand_name TEXT NOT NULL DEFAULT 'Cocktrail',
  logo_url TEXT,
  custom_theme JSONB,
  mercado_pago JSONB,
  club_id TEXT NOT NULL,
  club_name TEXT NOT NULL,
  use_logo_url BOOLEAN NOT NULL DEFAULT FALSE,
  logo_size INT NOT NULL DEFAULT 40,
  text_logo_value TEXT NOT NULL DEFAULT 'Cocktrail',
  text_logo_size INT NOT NULL DEFAULT 26
);

-- Grant privileges to Supabase API roles
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL PRIVILEGES ON ALL ROUTINES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO postgres, anon, authenticated, service_role;
