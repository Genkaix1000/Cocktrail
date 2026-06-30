-- schema.sql
-- Database schema for Cocktrail Local V1

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
  synced_at     TIMESTAMPTZ
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

-- Create indices for performance
CREATE INDEX IF NOT EXISTS idx_tickets_code_active ON tickets (code) WHERE redeemed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_orders_event_status ON orders (event_id, status);
CREATE INDEX IF NOT EXISTS idx_cash_sales_event ON cash_sales (event_id);

-- Grant privileges to Supabase API roles
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL PRIVILEGES ON ALL ROUTINES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO postgres, anon, authenticated, service_role;

