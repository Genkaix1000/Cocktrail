-- 20260722000100_orders_cobro.sql
-- cobro-verificado (R27): la autoridad de "esto se cobró" pasa al servidor.
-- Una venta no-efectivo 'cobrado' sin fila de cobro ligada queda imposible de
-- insertar — la invariante vive como CHECK, no como código.

-- mp_order_id liga la venta a su cobro (mp_orders nace primero, así que la fila
-- referenciada ya existe al insertar). ON DELETE NO ACTION deliberado: borrar un
-- cobro que respalda una venta DEBE fallar (CASCADE borraría la venta, SET NULL
-- rompería la auditoría en silencio).
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS mp_order_id UUID REFERENCES mp_orders(id);

-- Denormalización DELIBERADA (redundante con el join a mp_orders): es el string
-- que el dueño pega en el buscador del panel de MP, y sobrevive a un restore
-- parcial. Inmutable una vez aprobado — no "limpiar".
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS mp_payment_id TEXT;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

-- 'desconocido' es SOLO para filas pre-migración y pedidos de /carta (no hay
-- forma de saber retroactivamente cuáles se cobraron). 'pendiente_de_cobro'
-- queda reservado para la Fase 7 (rediseño del flujo digital del cliente).
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'desconocido';

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_payment_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_payment_status_check
  CHECK (payment_status IN ('cobrado', 'pendiente_de_cobro', 'desconocido'));

-- La invariante que hace irrepetible el bug del 22-07. El escape del efectivo
-- es irreductible: nadie puede verificar server-side que entraron billetes.
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_cobrado_requires_mp_order;
ALTER TABLE orders ADD CONSTRAINT orders_cobrado_requires_mp_order
  CHECK (payment_status <> 'cobrado' OR payment_method = 'efectivo' OR mp_order_id IS NOT NULL);

-- Idempotencia (R20), dos agujeros distintos: la key cubre "reintento del mismo
-- intento lógico" (incluido efectivo); mp_order_id cubre "key nueva, mismo cobro".
CREATE UNIQUE INDEX IF NOT EXISTS uq_orders_idempotency_key
  ON orders(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_orders_mp_order_id
  ON orders(mp_order_id) WHERE mp_order_id IS NOT NULL;
