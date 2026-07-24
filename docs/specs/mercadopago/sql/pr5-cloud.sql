-- pr5-cloud.sql — PR 5, lado Cloud. Pegar entero en el SQL Editor y ejecutar UNA vez.
-- Idempotente. Se aplica A MANO porque el runner de migraciones (PR 2) es local-only
-- (PgMigrationsRepository sobre DATABASE_URL) — mismo precedente que pr4-cloud.sql.
--
-- Crea (o CONVERGE) el espejo Cloud de las tablas MP que el sync sube al cerrar la
-- noche: mp_orders, mercadopago_cajas y mercadopago_cajas_devices.
--
-- ⚠ Las tablas MP pueden YA existir en Cloud con esquema viejo: la integración
-- original del 2026-07-17 operaba contra Cloud (`mpDb`), así que las migraciones
-- base (20260715000200/300, 20260717221900) corrieron allá y dejaron tablas SIN
-- las columnas posteriores (event_id, las de cobro-verificado, gestion-posnets,
-- store_name) y CON constraints hoy obsoletas — el CHECK de status original de 5
-- estados rechazaría los cobros `rejected` REALES del 22-07 (posteriores a la
-- migración de event_id, viajan con su noche) en el primer push. El CREATE TABLE
-- IF NOT EXISTS no-opea sobre una tabla existente, por eso el script converge en
-- dos pasos: ALTER ADD COLUMN IF NOT EXISTS por CADA columna, y después la
-- convergencia dirigida de constraints (CHECKs redefinidos a la definición local
-- vigente, FKs dropeadas, UNIQUEs alineados). Converge al esquema completo exista
-- o no la tabla. Los ALTER agregan columnas SIN NOT NULL (una tabla vieja puede
-- tener filas y un ADD COLUMN NOT NULL sin default revienta) y NO tocan tipos de
-- columnas existentes.
--
-- Espejo de archivo histórico: SIN FKs y sin triggers a propósito — la integridad
-- referencial la garantiza el origen local, y una FK rota acá no puede frenar un
-- backup (mismo criterio que las columnas de cobro de `orders` en Cloud). Los
-- CHECKs de mp_orders sí se recrean (definición local vigente, NOT VALID): son
-- invariantes del dato, no integridad referencial.

-- ============================================================================
-- 1) CREATE + convergencia de columnas
-- ============================================================================

-- 1a) Cobros MP (QR + Point) — espejo de mp_orders local
--     (20260717221900 + 20260721000100 + 20260721000200 + 20260722000000)
CREATE TABLE IF NOT EXISTS mp_orders (
  id                     UUID PRIMARY KEY,
  order_id_mp            TEXT NOT NULL,
  external_ref           TEXT NOT NULL,
  idempotency_key        TEXT NOT NULL,
  payment_transaction_id TEXT,
  payment_id             TEXT,
  amount                 NUMERIC(12,2) NOT NULL,
  status                 TEXT NOT NULL,
  type                   TEXT NOT NULL,
  bar_id                 TEXT,
  caja_id                UUID,          -- sin FK: archivo histórico
  created_at             TIMESTAMPTZ,
  updated_at             TIMESTAMPTZ,
  event_id               UUID,          -- sin FK: la noche vive en night_events (cloud)
  qr_data                TEXT,
  expires_at             TIMESTAMPTZ,
  device_id              TEXT,
  attempt_id             TEXT,
  raw_state              TEXT,
  payment_status         TEXT,
  payment_status_detail  TEXT,
  paid_amount            NUMERIC(12,2),
  verified_at            TIMESTAMPTZ,
  verification_error     TEXT,
  cart_items             JSONB
);

ALTER TABLE mp_orders ADD COLUMN IF NOT EXISTS order_id_mp            TEXT;
ALTER TABLE mp_orders ADD COLUMN IF NOT EXISTS external_ref           TEXT;
ALTER TABLE mp_orders ADD COLUMN IF NOT EXISTS idempotency_key        TEXT;
ALTER TABLE mp_orders ADD COLUMN IF NOT EXISTS payment_transaction_id TEXT;
ALTER TABLE mp_orders ADD COLUMN IF NOT EXISTS payment_id             TEXT;
ALTER TABLE mp_orders ADD COLUMN IF NOT EXISTS amount                 NUMERIC(12,2);
ALTER TABLE mp_orders ADD COLUMN IF NOT EXISTS status                 TEXT;
ALTER TABLE mp_orders ADD COLUMN IF NOT EXISTS type                   TEXT;
ALTER TABLE mp_orders ADD COLUMN IF NOT EXISTS bar_id                 TEXT;
ALTER TABLE mp_orders ADD COLUMN IF NOT EXISTS caja_id                UUID;
ALTER TABLE mp_orders ADD COLUMN IF NOT EXISTS created_at             TIMESTAMPTZ;
ALTER TABLE mp_orders ADD COLUMN IF NOT EXISTS updated_at             TIMESTAMPTZ;
ALTER TABLE mp_orders ADD COLUMN IF NOT EXISTS event_id               UUID;
ALTER TABLE mp_orders ADD COLUMN IF NOT EXISTS qr_data                TEXT;
ALTER TABLE mp_orders ADD COLUMN IF NOT EXISTS expires_at             TIMESTAMPTZ;
ALTER TABLE mp_orders ADD COLUMN IF NOT EXISTS device_id              TEXT;
ALTER TABLE mp_orders ADD COLUMN IF NOT EXISTS attempt_id             TEXT;
ALTER TABLE mp_orders ADD COLUMN IF NOT EXISTS raw_state              TEXT;
ALTER TABLE mp_orders ADD COLUMN IF NOT EXISTS payment_status         TEXT;
ALTER TABLE mp_orders ADD COLUMN IF NOT EXISTS payment_status_detail  TEXT;
ALTER TABLE mp_orders ADD COLUMN IF NOT EXISTS paid_amount            NUMERIC(12,2);
ALTER TABLE mp_orders ADD COLUMN IF NOT EXISTS verified_at            TIMESTAMPTZ;
ALTER TABLE mp_orders ADD COLUMN IF NOT EXISTS verification_error     TEXT;
ALTER TABLE mp_orders ADD COLUMN IF NOT EXISTS cart_items             JSONB;

-- 1b) Cajas (PDV) — espejo de mercadopago_cajas local (20260715000200 + store_name
--     de 20260724000000_gestion_posnets)
CREATE TABLE IF NOT EXISTS mercadopago_cajas (
  id              UUID PRIMARY KEY,
  bar_id          UUID NOT NULL,       -- sin FK a bars: archivo histórico
  store_id        TEXT NOT NULL,
  external_pos_id TEXT NOT NULL,
  pos_id_mp       TEXT,
  qr_image        TEXT,
  qr_template     TEXT,
  seller_user_id  TEXT NOT NULL,       -- sin FK a mercadopago_sellers: archivo histórico
  created_at      TIMESTAMPTZ,
  store_name      TEXT
);

ALTER TABLE mercadopago_cajas ADD COLUMN IF NOT EXISTS bar_id          UUID;
ALTER TABLE mercadopago_cajas ADD COLUMN IF NOT EXISTS store_id        TEXT;
ALTER TABLE mercadopago_cajas ADD COLUMN IF NOT EXISTS external_pos_id TEXT;
ALTER TABLE mercadopago_cajas ADD COLUMN IF NOT EXISTS pos_id_mp       TEXT;
ALTER TABLE mercadopago_cajas ADD COLUMN IF NOT EXISTS qr_image        TEXT;
ALTER TABLE mercadopago_cajas ADD COLUMN IF NOT EXISTS qr_template    TEXT;
ALTER TABLE mercadopago_cajas ADD COLUMN IF NOT EXISTS seller_user_id  TEXT;
ALTER TABLE mercadopago_cajas ADD COLUMN IF NOT EXISTS created_at      TIMESTAMPTZ;
ALTER TABLE mercadopago_cajas ADD COLUMN IF NOT EXISTS store_name      TEXT;

-- 1c) Posnets — espejo de mercadopago_cajas_devices local (20260715000300 +
--     20260717224503 + columnas de 20260724000000_gestion_posnets)
CREATE TABLE IF NOT EXISTS mercadopago_cajas_devices (
  id                       UUID PRIMARY KEY,
  caja_id                  UUID,       -- sin FK: archivo histórico
  device_id                TEXT NOT NULL,
  device_username          TEXT,
  operating_mode           TEXT,       -- sin CHECK: el pull local normaliza
  is_active                BOOLEAN NOT NULL DEFAULT false,
  linked_at                TIMESTAMPTZ,
  deactivated_at           TIMESTAMPTZ,
  operating_mode_synced_at TIMESTAMPTZ,
  created_at               TIMESTAMPTZ
);

ALTER TABLE mercadopago_cajas_devices ADD COLUMN IF NOT EXISTS caja_id                  UUID;
ALTER TABLE mercadopago_cajas_devices ADD COLUMN IF NOT EXISTS device_id                TEXT;
ALTER TABLE mercadopago_cajas_devices ADD COLUMN IF NOT EXISTS device_username          TEXT;
ALTER TABLE mercadopago_cajas_devices ADD COLUMN IF NOT EXISTS operating_mode           TEXT;
-- NOT NULL DEFAULT false es seguro en ADD COLUMN: Postgres backfillea el default.
ALTER TABLE mercadopago_cajas_devices ADD COLUMN IF NOT EXISTS is_active                BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE mercadopago_cajas_devices ADD COLUMN IF NOT EXISTS linked_at                TIMESTAMPTZ;
ALTER TABLE mercadopago_cajas_devices ADD COLUMN IF NOT EXISTS deactivated_at           TIMESTAMPTZ;
ALTER TABLE mercadopago_cajas_devices ADD COLUMN IF NOT EXISTS operating_mode_synced_at TIMESTAMPTZ;
ALTER TABLE mercadopago_cajas_devices ADD COLUMN IF NOT EXISTS created_at               TIMESTAMPTZ;

-- ============================================================================
-- 2) Convergencia de constraints
-- ============================================================================

-- 2a) FKs: el archivo histórico va SIN FKs — la integridad referencial la
-- garantiza el origen local, y una FK rota acá no puede frenar un backup. Las
-- tablas viejas las traen de sus migraciones base con nombres autogenerados
-- (mercadopago_cajas.bar_id→bars, .seller_user_id→sellers, devices.caja_id→cajas,
-- mp_orders.caja_id→cajas), así que se buscan por contype='f' en pg_constraint
-- en vez de confiar en los nombres.
DO $$
DECLARE fk RECORD;
BEGIN
  FOR fk IN
    SELECT conname, conrelid::regclass AS tbl
    FROM pg_catalog.pg_constraint
    WHERE contype = 'f'
      AND conrelid IN ('mp_orders'::regclass,
                       'mercadopago_cajas'::regclass,
                       'mercadopago_cajas_devices'::regclass)
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', fk.tbl, fk.conname);
  END LOOP;
END $$;

-- 2b) CHECKs de mp_orders: la tabla vieja trae el mp_orders_status_check ORIGINAL
-- de 5 estados, que rechazaría los cobros `rejected` reales del 22-07 en el primer
-- push. Se recrean con la definición LOCAL vigente (copiada textual de
-- 20260721000200 + 20260722000000). NOT VALID a propósito: valida las escrituras
-- nuevas (los pushes, que ya llegan validadas del local) sin exigir que las filas
-- históricas pre-remediación que viven en Cloud cumplan invariantes que no
-- existían cuando se escribieron — re-validarlas podría frenar el script entero
-- (p.ej. un processed viejo sin paid_amount, columna que recién existe desde 1a).
ALTER TABLE mp_orders DROP CONSTRAINT IF EXISTS mp_orders_status_check;
ALTER TABLE mp_orders ADD CONSTRAINT mp_orders_status_check
  CHECK (status IN (
    'created', 'processed', 'canceled', 'refunded', 'expired',
    'failed', 'action_required', 'unknown', 'rejected'
  )) NOT VALID;

ALTER TABLE mp_orders DROP CONSTRAINT IF EXISTS mp_orders_type_check;
ALTER TABLE mp_orders ADD CONSTRAINT mp_orders_type_check
  CHECK (type IN ('qr', 'point')) NOT VALID;

ALTER TABLE mp_orders DROP CONSTRAINT IF EXISTS mp_orders_point_requires_device;
ALTER TABLE mp_orders ADD CONSTRAINT mp_orders_point_requires_device
  CHECK (type <> 'point' OR device_id IS NOT NULL) NOT VALID;

ALTER TABLE mp_orders DROP CONSTRAINT IF EXISTS mp_orders_processed_requires_paid_amount;
ALTER TABLE mp_orders ADD CONSTRAINT mp_orders_processed_requires_paid_amount
  CHECK (status <> 'processed' OR (paid_amount IS NOT NULL AND payment_id IS NOT NULL)) NOT VALID;

-- 2c) UNIQUEs de mp_orders (espejo de 20260721000000): dedupe previo idéntico al
-- local — las filas viejas de Cloud (datos de prueba) nunca pasaron por esa
-- migración y un duplicado frenaría el CREATE UNIQUE INDEX. Conserva la fila más
-- vieja, igual que el local.
DELETE FROM mp_orders
WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY order_id_mp ORDER BY created_at ASC NULLS LAST, id ASC) AS rn
    FROM mp_orders
  ) t
  WHERE t.rn > 1
);

DELETE FROM mp_orders
WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY external_ref ORDER BY created_at ASC NULLS LAST, id ASC) AS rn
    FROM mp_orders
  ) t
  WHERE t.rn > 1
);

DELETE FROM mp_orders
WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY idempotency_key ORDER BY created_at ASC NULLS LAST, id ASC) AS rn
    FROM mp_orders
  ) t
  WHERE t.rn > 1
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_mp_orders_order_id_mp     ON mp_orders(order_id_mp);
CREATE UNIQUE INDEX IF NOT EXISTS uq_mp_orders_external_ref    ON mp_orders(external_ref);
CREATE UNIQUE INDEX IF NOT EXISTS uq_mp_orders_idempotency_key ON mp_orders(idempotency_key);

-- Redundantes con los UNIQUE de arriba (mismo criterio que el local, que los dropeó).
DROP INDEX IF EXISTS idx_mp_orders_order_id_mp;
DROP INDEX IF EXISTS idx_mp_orders_external_ref;

-- 2d) UNIQUEs de devices: uq_device_caja ("1 terminal por caja", incondicional)
-- ya NO existe en el esquema local (20260717224503 lo dropeó; hoy rige el parcial
-- uq_device_caja_active de gestion-posnets). uq_device_id sí sigue vigente en
-- local — se crea si falta (tabla nueva) y se conserva si ya está (tabla vieja,
-- donde vive como constraint homónima: el IF NOT EXISTS del índice la detecta).
ALTER TABLE mercadopago_cajas_devices DROP CONSTRAINT IF EXISTS uq_device_caja;
CREATE UNIQUE INDEX IF NOT EXISTS uq_device_id ON mercadopago_cajas_devices (device_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_device_caja_active
  ON mercadopago_cajas_devices (caja_id) WHERE is_active;

-- Los UNIQUEs de mercadopago_cajas (uq_caja_seller_external, UNIQUE(bar_id))
-- siguen vigentes en el esquema local — no se tocan: si la tabla vieja los trae,
-- coinciden con el diseño actual.

-- ============================================================================
-- 3) Índices de consulta
-- ============================================================================

-- Consulta real de conciliación: "los cobros MP de tal noche" (gate del PR 5).
-- Va DESPUÉS de la convergencia de columnas: sobre la tabla vieja, event_id
-- recién existe desde el paso 1a.
CREATE INDEX IF NOT EXISTS idx_mp_orders_event_id ON mp_orders(event_id);

-- ============================================================================
-- 4) RLS + least-privilege (patrón pr4-cloud.sql)
-- ============================================================================
-- Tablas de uso exclusivo del backend vía service_role (BYPASSRLS). Denegación
-- dura para el cliente. Sobre las tablas viejas (que ya traían el REVOKE de su
-- migración base) es no-op.
ALTER TABLE mp_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE mercadopago_cajas ENABLE ROW LEVEL SECURITY;
ALTER TABLE mercadopago_cajas_devices ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_policies
    WHERE policyname = 'mp_orders_deny_all' AND tablename = 'mp_orders'
  ) THEN
    CREATE POLICY mp_orders_deny_all
      ON mp_orders FOR ALL TO authenticated, anon USING (false);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_policies
    WHERE policyname = 'mp_cajas_deny_all' AND tablename = 'mercadopago_cajas'
  ) THEN
    CREATE POLICY mp_cajas_deny_all
      ON mercadopago_cajas FOR ALL TO authenticated, anon USING (false);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_policies
    WHERE policyname = 'mp_devices_deny_all' AND tablename = 'mercadopago_cajas_devices'
  ) THEN
    CREATE POLICY mp_devices_deny_all
      ON mercadopago_cajas_devices FOR ALL TO authenticated, anon USING (false);
  END IF;
END $$;

GRANT ALL PRIVILEGES ON TABLE mp_orders, mercadopago_cajas, mercadopago_cajas_devices
  TO postgres, service_role;
REVOKE ALL PRIVILEGES ON TABLE mp_orders, mercadopago_cajas, mercadopago_cajas_devices
  FROM anon, authenticated;
