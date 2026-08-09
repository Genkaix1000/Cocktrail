-- F5A: neto/fee reales que informa MP por cobro (GET /v1/payments).
-- Bruto (paid_amount) no se toca — ticket y arqueo siguen iguales.

ALTER TABLE mp_orders
  ADD COLUMN IF NOT EXISTS net_received_amount NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS mp_fee_amount       NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS fee_status          TEXT NOT NULL DEFAULT 'none';

ALTER TABLE mp_orders DROP CONSTRAINT IF EXISTS mp_orders_fee_status_check;
ALTER TABLE mp_orders ADD CONSTRAINT mp_orders_fee_status_check
  CHECK (fee_status IN ('none', 'pending', 'ready', 'unavailable'));

CREATE INDEX IF NOT EXISTS idx_mp_orders_fee_pending
  ON mp_orders (created_at)
  WHERE status = 'processed' AND fee_status = 'pending' AND payment_id IS NOT NULL;
