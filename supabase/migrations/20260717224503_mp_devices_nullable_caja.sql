-- 20260717224503_mp_devices_nullable_caja.sql
-- Fase 5: Posnets se registran por deviceId+alias sin exigir PDV.
-- La vinculación a una caja es opcional (dropdown en Puntos de Venta).
-- Ver docs/fases-mp/fase-5-posnet.md.

-- 1 caja = 1 terminal sigue valiendo, pero solo cuando hay vínculo.
ALTER TABLE mercadopago_cajas_devices DROP CONSTRAINT IF EXISTS uq_device_caja;
ALTER TABLE mercadopago_cajas_devices ALTER COLUMN caja_id DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_device_caja_linked
  ON mercadopago_cajas_devices (caja_id)
  WHERE caja_id IS NOT NULL;
