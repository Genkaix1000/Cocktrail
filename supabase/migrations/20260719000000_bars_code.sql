-- 20260719000000_bars_code.sql
-- Fase 3: mapea BAR_CODE (ej. BARRA-01) ↔ bars.id (UUID).
-- mercadopago_cajas.bar_id es UUID FK; la UI/env usan el código legible.

ALTER TABLE bars ADD COLUMN IF NOT EXISTS code TEXT;

-- Índice único parcial: permite NULLs legacy, pero un código no se repite.
CREATE UNIQUE INDEX IF NOT EXISTS uq_bars_code ON bars (code) WHERE code IS NOT NULL;

-- Seed de la barra operativa (idempotente: solo si no existe).
INSERT INTO bars (id, name, code)
SELECT gen_random_uuid(), 'Barra VIP', 'BARRA-01'
WHERE NOT EXISTS (SELECT 1 FROM bars WHERE code = 'BARRA-01');
