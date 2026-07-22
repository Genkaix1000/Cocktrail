-- 20260721000300_mp_webhook_events.sql
-- PR 3: durabilidad de webhooks de MP. Cada notificación se persiste ANTES de
-- responder 200 — si el proceso muere entre el 200 y el reconcile, replayPending()
-- la retoma en el próximo boot. Tabla local-only: NO entra al sync con Cloud.

CREATE TABLE IF NOT EXISTS mp_webhook_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Dedupe de reintentos de MP: mismo x-request-id → mismo evento, no se reprocesa.
  x_request_id TEXT NOT NULL UNIQUE,
  data_id      TEXT,
  type         TEXT,
  payload      JSONB NOT NULL DEFAULT '{}'::jsonb,
  received_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  attempts     INTEGER NOT NULL DEFAULT 0,
  last_error   TEXT
);

-- Índice parcial: replayPending() solo mira los no procesados.
CREATE INDEX IF NOT EXISTS idx_mp_webhook_events_pending
  ON mp_webhook_events(received_at)
  WHERE processed_at IS NULL;

-- Tabla de uso exclusivo del backend (service_role), como mp_orders.
GRANT ALL PRIVILEGES ON TABLE mp_webhook_events TO postgres, service_role;
REVOKE ALL PRIVILEGES ON TABLE mp_webhook_events FROM anon, authenticated;
