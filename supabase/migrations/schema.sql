-- schema.sql
-- Cumulative database schema for Cocktrail Local

-- Enable UUID extension if not enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- night_events: Track active/closed status, timestamps, and sync_status
CREATE TABLE IF NOT EXISTS night_events (
  id            UUID PRIMARY KEY,
  status        TEXT NOT NULL CHECK (status IN ('activo', 'cerrado')),
  started_at    TIMESTAMPTZ NOT NULL,
  closed_at     TIMESTAMPTZ,
  order_counter INT NOT NULL DEFAULT 0,
  sync_status   TEXT DEFAULT 'pending' CHECK (sync_status IN ('pending', 'synced', 'failed')),
  synced_at     TIMESTAMPTZ,
  closed_by     TEXT
);

-- orders: Store transaction items (JSONB), totals, display numbers, status, and HMAC ticket codes
CREATE TABLE IF NOT EXISTS orders (
  id              UUID PRIMARY KEY,
  event_id        UUID NOT NULL REFERENCES night_events(id) ON DELETE CASCADE,
  token           TEXT NOT NULL,
  display_number  INT NOT NULL,
  items           JSONB NOT NULL,
  total           INT NOT NULL,
  payment_method  TEXT NOT NULL,
  status          TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL,
  ready_at        TIMESTAMPTZ,
  delivered_at    TIMESTAMPTZ,
  ticket_code     TEXT,
  created_by      TEXT,
  cancelled_by    TEXT,
  cancelled_at    TIMESTAMPTZ,
  delivered_by    TEXT,
  delivered_by_bar TEXT,
  redeem_method   TEXT
);

-- tickets: Store HMAC codes and redemption status
CREATE TABLE IF NOT EXISTS tickets (
  id              UUID PRIMARY KEY,
  order_id        UUID UNIQUE NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  code            TEXT UNIQUE NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL,
  redeemed_at     TIMESTAMPTZ,
  redeemed_by     TEXT,
  redeemed_by_bar TEXT,
  redeem_method   TEXT
);

-- cash_sales: Track cash flows tied to the active night event
CREATE TABLE IF NOT EXISTS cash_sales (
  id            UUID PRIMARY KEY,
  event_id      UUID NOT NULL REFERENCES night_events(id) ON DELETE CASCADE,
  amount        INT NOT NULL,
  description   TEXT NOT NULL,
  added_by      TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL
);

-- users: Edge-sync staff records
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL,
  permissions JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- drinks: Edge-sync drink catalog
CREATE TABLE IF NOT EXISTS drinks (
  id INT PRIMARY KEY,
  name TEXT NOT NULL,
  price INT NOT NULL,
  description TEXT NOT NULL,
  vibe TEXT NOT NULL,
  flavors JSONB NOT NULL,
  icon_name TEXT NOT NULL,
  image TEXT,
  trending BOOLEAN NOT NULL DEFAULT FALSE,
  promo BOOLEAN NOT NULL DEFAULT FALSE,
  available BOOLEAN NOT NULL DEFAULT TRUE
);

-- app_config: Edge-sync config
CREATE TABLE IF NOT EXISTS app_config (
  id TEXT PRIMARY KEY DEFAULT 'default',
  theme TEXT NOT NULL DEFAULT 'bosko',
  brand_name TEXT NOT NULL DEFAULT 'Bosko',
  logo_url TEXT DEFAULT '/bosko.webp',
  custom_theme JSONB,
  mercado_pago JSONB,
  club_id TEXT NOT NULL,
  club_name TEXT NOT NULL,
  use_logo_url BOOLEAN NOT NULL DEFAULT TRUE,
  logo_size INT NOT NULL DEFAULT 56,
  text_logo_value TEXT NOT NULL DEFAULT 'Bosko',
  text_logo_size INT NOT NULL DEFAULT 26
);

-- audit_logs: System activity log
CREATE TABLE IF NOT EXISTS audit_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action      TEXT NOT NULL,
  description TEXT NOT NULL,
  operator    TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indices for performance
CREATE INDEX IF NOT EXISTS idx_tickets_code_active ON tickets (code) WHERE redeemed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_orders_event_status ON orders (event_id, status);
CREATE INDEX IF NOT EXISTS idx_cash_sales_event ON cash_sales (event_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs (created_at DESC);

-- Grant privileges to Supabase API roles
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL PRIVILEGES ON ALL ROUTINES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO postgres, anon, authenticated, service_role;
