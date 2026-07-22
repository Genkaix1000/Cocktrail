-- 20260722000000_mp_orders_point.sql
-- cobro-verificado (R27): persistir el intent del Posnet y el veredicto del pago real.
-- mp_orders pasa a ser la fila de cobro tanto de QR como de Point. Los montos
-- (amount, paid_amount) se guardan SIEMPRE en PESOS — la conversión a centavos
-- vive únicamente en el borde HTTP de la Point API (mercadopago.service.ts).

ALTER TABLE mp_orders
  ADD COLUMN IF NOT EXISTS device_id              TEXT,
  ADD COLUMN IF NOT EXISTS attempt_id             TEXT,
  ADD COLUMN IF NOT EXISTS raw_state              TEXT,
  ADD COLUMN IF NOT EXISTS payment_status         TEXT,
  ADD COLUMN IF NOT EXISTS payment_status_detail  TEXT,
  ADD COLUMN IF NOT EXISTS paid_amount            NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS verified_at            TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verification_error     TEXT,
  ADD COLUMN IF NOT EXISTS cart_items             JSONB;

-- 'rejected' se distingue de 'canceled': es la distinción que la cajera necesita
-- (tarjeta sin fondos ≠ cancelado a propósito) y que originó el incidente del 22-07.
ALTER TABLE mp_orders DROP CONSTRAINT IF EXISTS mp_orders_status_check;
ALTER TABLE mp_orders ADD CONSTRAINT mp_orders_status_check
  CHECK (status IN (
    'created', 'processed', 'canceled', 'refunded', 'expired',
    'failed', 'action_required', 'unknown', 'rejected'
  ));

-- type era TEXT libre en una tabla de plata.
ALTER TABLE mp_orders DROP CONSTRAINT IF EXISTS mp_orders_type_check;
ALTER TABLE mp_orders ADD CONSTRAINT mp_orders_type_check
  CHECK (type IN ('qr', 'point'));

ALTER TABLE mp_orders DROP CONSTRAINT IF EXISTS mp_orders_point_requires_device;
ALTER TABLE mp_orders ADD CONSTRAINT mp_orders_point_requires_device
  CHECK (type <> 'point' OR device_id IS NOT NULL);

-- Un cobro 'processed' sin monto pagado ni payment_id es exactamente el estado
-- que produjo el incidente del 22-07: queda imposible de persistir.
ALTER TABLE mp_orders DROP CONSTRAINT IF EXISTS mp_orders_processed_requires_paid_amount;
ALTER TABLE mp_orders ADD CONSTRAINT mp_orders_processed_requires_paid_amount
  CHECK (status <> 'processed' OR (paid_amount IS NOT NULL AND payment_id IS NOT NULL));

-- NO único a propósito: la auto-recuperación del error 2205 ("queued intent")
-- crea un segundo intent legítimo para el mismo intento lógico de cobro.
CREATE INDEX IF NOT EXISTS idx_mp_orders_attempt_id
  ON mp_orders(attempt_id) WHERE attempt_id IS NOT NULL;

-- Re-asegura least-privilege (mismo criterio que 20260717221900).
GRANT ALL PRIVILEGES ON TABLE mp_orders TO postgres, service_role;
REVOKE ALL PRIVILEGES ON TABLE mp_orders FROM anon, authenticated;
