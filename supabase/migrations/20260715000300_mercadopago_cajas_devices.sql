-- 20260715000300_mercadopago_cajas_devices.sql
-- Vincula cada caja con su terminal Point física.
-- Ver docs/specs/mercadopago/integracion-mp.md § "Modelo de datos" + docs/mp/api-point-devices.md.

CREATE TABLE IF NOT EXISTS mercadopago_cajas_devices (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  caja_id         UUID NOT NULL REFERENCES mercadopago_cajas(id),
  device_id       TEXT NOT NULL,                           -- "PAX_A910__SMART..."
  device_username TEXT,                                    -- alias del operador con la tablet
  operating_mode  TEXT DEFAULT 'PDV',  -- validar en app, no con CHECK (viene de la API de MP)

  -- Restricciones del modelo operativo
  CONSTRAINT uq_device_caja UNIQUE (caja_id),              -- 1 terminal por caja
  CONSTRAINT uq_device_id   UNIQUE (device_id)             -- 1 caja por terminal
);

-- Tabla de uso exclusivo del backend (service_role). Least-privilege: se revocan
-- los privilegios que los DEFAULT PRIVILEGES de Supabase otorgan a anon/authenticated.
GRANT ALL PRIVILEGES ON TABLE mercadopago_cajas_devices TO postgres, service_role;
REVOKE ALL PRIVILEGES ON TABLE mercadopago_cajas_devices FROM anon, authenticated;
