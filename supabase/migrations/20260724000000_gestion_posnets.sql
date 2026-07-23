-- 20260724000000_gestion_posnets.sql
-- gestion-posnets: un device pertenece a UNA caja para siempre (trazabilidad de
-- cobros históricos); a lo sumo UN device activo por caja; operating_mode pasa a
-- ser cache declarado de lo que devolvió MP (R25), no un default optimista.
-- Ver docs/specs/mercadopago/gestion-posnets.md § "Cambios de datos" (M1).

ALTER TABLE mercadopago_cajas_devices
  ADD COLUMN IF NOT EXISTS is_active                BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS linked_at                TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deactivated_at           TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS operating_mode_synced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS created_at               TIMESTAMPTZ NOT NULL DEFAULT now();

-- Backfill: hoy "vinculado" implica "activo". linked_at=now() es aproximación honesta.
-- deactivated_at IS NULL: en una corrida baseline (schema_migrations vacía sobre un
-- esquema ya migrado) NO re-activa devices históricos ni choca con uq_device_caja_active.
UPDATE mercadopago_cajas_devices
   SET is_active = true, linked_at = now()
 WHERE caja_id IS NOT NULL AND NOT is_active AND deactivated_at IS NULL;

UPDATE mercadopago_cajas_devices
   SET operating_mode = NULL
 WHERE operating_mode IS NOT NULL AND operating_mode NOT IN ('PDV', 'STANDALONE');

ALTER TABLE mercadopago_cajas_devices ALTER COLUMN operating_mode DROP DEFAULT;

ALTER TABLE mercadopago_cajas_devices DROP CONSTRAINT IF EXISTS chk_operating_mode;
ALTER TABLE mercadopago_cajas_devices
  ADD CONSTRAINT chk_operating_mode
  CHECK (operating_mode IS NULL OR operating_mode IN ('PDV', 'STANDALONE'));

ALTER TABLE mercadopago_cajas_devices DROP CONSTRAINT IF EXISTS chk_active_requiere_caja;
ALTER TABLE mercadopago_cajas_devices
  ADD CONSTRAINT chk_active_requiere_caja CHECK (NOT is_active OR caja_id IS NOT NULL);

DROP INDEX IF EXISTS uq_device_caja_linked;
CREATE UNIQUE INDEX IF NOT EXISTS uq_device_caja_active
  ON mercadopago_cajas_devices (caja_id) WHERE is_active;

CREATE INDEX IF NOT EXISTS idx_mp_devices_caja
  ON mercadopago_cajas_devices (caja_id) WHERE caja_id IS NOT NULL;

-- caja_id inmutable una vez asignado: el invariante del dueño, en la base.
CREATE OR REPLACE FUNCTION mp_devices_caja_inmutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.caja_id IS NOT NULL AND NEW.caja_id IS DISTINCT FROM OLD.caja_id THEN
    RAISE EXCEPTION 'El Posnet % pertenece históricamente a su caja: caja_id es inmutable (desactivar, no mover).', OLD.device_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_mp_devices_caja_inmutable ON mercadopago_cajas_devices;
CREATE TRIGGER trg_mp_devices_caja_inmutable
  BEFORE UPDATE OF caja_id ON mercadopago_cajas_devices
  FOR EACH ROW EXECUTE FUNCTION mp_devices_caja_inmutable();

-- mp_orders.device_id es TEXT sin FK: este trigger es el sustituto honesto.
CREATE OR REPLACE FUNCTION mp_devices_sin_cobros_para_borrar() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM mp_orders WHERE device_id = OLD.device_id) THEN
    RAISE EXCEPTION 'El Posnet % tiene cobros registrados: se desactiva, no se borra.', OLD.device_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  RETURN OLD;
END;
$$;
DROP TRIGGER IF EXISTS trg_mp_devices_no_delete_con_cobros ON mercadopago_cajas_devices;
CREATE TRIGGER trg_mp_devices_no_delete_con_cobros
  BEFORE DELETE ON mercadopago_cajas_devices
  FOR EACH ROW EXECUTE FUNCTION mp_devices_sin_cobros_para_borrar();

-- store_name: cache del nombre real de MP (rama A) o alias local (rama B).
ALTER TABLE mercadopago_cajas ADD COLUMN IF NOT EXISTS store_name TEXT;
