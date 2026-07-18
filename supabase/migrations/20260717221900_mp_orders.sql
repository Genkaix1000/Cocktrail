-- 20260717221900_mp_orders.sql
-- Fase 4: orders de MP (QR estático / Point). Persiste order_id_mp, payment_transaction_id
-- (al crear) y payment_id (al concretarse vía consulta/webhook) para polling + conciliación.
-- Ver docs/fases-mp/fase-4-qr.md.

CREATE TABLE IF NOT EXISTS mp_orders (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id_mp            TEXT NOT NULL,           -- "ORD01K371..." (response.id al crear)
  external_ref           TEXT NOT NULL,           -- "COCKTRAIL-{ts}-{random4}" (máx 64 chars, sin PII)
  idempotency_key        TEXT NOT NULL,           -- UUID usado en X-Idempotency-Key al crear
  payment_transaction_id TEXT,                    -- transactions.payments[0].id (al crear la order)
  payment_id             TEXT,                    -- ID real del pago (reference_id en consulta/webhook)
  amount                 NUMERIC(12,2) NOT NULL,
  status                 TEXT NOT NULL            -- created|processed|canceled|refunded|expired
                           CHECK (status IN ('created','processed','canceled','refunded','expired')),
  type                   TEXT NOT NULL,           -- 'qr' | 'point'
  bar_id                 TEXT,
  caja_id                UUID REFERENCES mercadopago_cajas(id),
  created_at             TIMESTAMPTZ DEFAULT NOW(),
  updated_at             TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mp_orders_external_ref ON mp_orders(external_ref);
CREATE INDEX IF NOT EXISTS idx_mp_orders_payment_id    ON mp_orders(payment_id);
CREATE INDEX IF NOT EXISTS idx_mp_orders_order_id_mp   ON mp_orders(order_id_mp);

-- Tabla de uso exclusivo del backend (service_role). Least-privilege: se revocan
-- los privilegios que los DEFAULT PRIVILEGES de Supabase otorgan a anon/authenticated.
GRANT ALL PRIVILEGES ON TABLE mp_orders TO postgres, service_role;
REVOKE ALL PRIVILEGES ON TABLE mp_orders FROM anon, authenticated;
