-- Barras se pueden deshabilitar para no aparecer en el selector de caja.
ALTER TABLE bars ADD COLUMN IF NOT EXISTS enabled BOOLEAN NOT NULL DEFAULT true;
