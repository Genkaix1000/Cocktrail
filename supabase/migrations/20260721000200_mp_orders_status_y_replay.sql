-- 20260721000200_mp_orders_status_y_replay.sql
-- PR 3: estados nuevos de mapMpStatus (failed/action_required/unknown — antes
-- cualquier estado desconocido de MP se pisaba como 'created') + columnas para
-- el replay idempotente del create (misma key → misma respuesta sin tocar MP).

-- Nombre real verificado en pg_constraint: mp_orders_status_check.
ALTER TABLE mp_orders DROP CONSTRAINT IF EXISTS mp_orders_status_check;
ALTER TABLE mp_orders ADD CONSTRAINT mp_orders_status_check
  CHECK (status IN (
    'created', 'processed', 'canceled', 'refunded', 'expired',
    'failed', 'action_required', 'unknown'
  ));

ALTER TABLE mp_orders
  ADD COLUMN IF NOT EXISTS qr_data TEXT;

ALTER TABLE mp_orders
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
