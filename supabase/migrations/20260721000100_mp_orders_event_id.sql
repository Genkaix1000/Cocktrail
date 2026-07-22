-- 20260721000100_mp_orders_event_id.sql
-- PR 3: liga cada cobro QR a la noche en que ocurrió (prerrequisito del sync — PR 5).
-- Sin backfill: las filas anteriores quedan con event_id NULL a propósito.

ALTER TABLE mp_orders
  ADD COLUMN IF NOT EXISTS event_id UUID REFERENCES night_events(id);

CREATE INDEX IF NOT EXISTS idx_mp_orders_event_id ON mp_orders(event_id);
