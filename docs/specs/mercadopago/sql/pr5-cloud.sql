-- pr5-cloud.sql — PR 5, lado Cloud. Pegar entero en el SQL Editor y ejecutar UNA vez.
-- Idempotente. Se aplica A MANO porque el runner de migraciones (PR 2) es local-only
-- (PgMigrationsRepository sobre DATABASE_URL) — mismo precedente que pr4-cloud.sql.
--
-- Crea el espejo Cloud de las tablas MP que el sync sube al cerrar la noche:
-- mp_orders, mercadopago_cajas y mercadopago_cajas_devices. Son ARCHIVO HISTÓRICO:
-- sin FKs, sin triggers y sin CHECKs de negocio a propósito — la integridad la
-- garantiza el origen local, y una FK/CHECK rota acá no puede frenar un backup
-- (mismo criterio que las columnas de cobro de `orders` en Cloud).

-- 1) Cobros MP (QR + Point) — espejo de mp_orders local (hasta 20260722000000)
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

-- Consulta real de conciliación: "los cobros MP de tal noche" (gate del PR 5).
CREATE INDEX IF NOT EXISTS idx_mp_orders_event_id ON mp_orders(event_id);

-- 2) Cajas (PDV) — espejo de mercadopago_cajas local (incluye store_name de gestion-posnets)
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

-- 3) Posnets — espejo de mercadopago_cajas_devices local (incluye columnas de gestion-posnets)
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

-- 4) RLS + least-privilege (patrón pr4-cloud.sql): tablas de uso exclusivo del
-- backend vía service_role (BYPASSRLS). Denegación dura para el cliente.
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
