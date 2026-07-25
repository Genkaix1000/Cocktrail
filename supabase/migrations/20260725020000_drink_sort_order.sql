-- Orden por trago dentro de su categoría (menor = más arriba; 0 = sin preferencia).
ALTER TABLE drinks ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

-- Tendencias con el orden pedido. Champagne Renacer pasa de Promos a Tendencias.
UPDATE drinks SET category_id = 'tendencias', sort_order = 1 WHERE id = 4;   -- Vodka con Speed
UPDATE drinks SET category_id = 'tendencias', sort_order = 2 WHERE id = 5;   -- Absolut con Speed
UPDATE drinks SET category_id = 'tendencias', sort_order = 3 WHERE id = 22;  -- Fernet
UPDATE drinks SET category_id = 'tendencias', sort_order = 4 WHERE id = 2;   -- Corona
UPDATE drinks SET category_id = 'tendencias', sort_order = 5 WHERE id = 1;   -- Andes
UPDATE drinks SET category_id = 'tendencias', sort_order = 6 WHERE id = 11;  -- Gin (Trago Estándar)
UPDATE drinks SET category_id = 'tendencias', sort_order = 7 WHERE id = 20;  -- Jagger con Speed
UPDATE drinks SET category_id = 'tendencias', sort_order = 8 WHERE id = 34;  -- Champagne Renacer + 2 Speed
UPDATE drinks SET category_id = 'tendencias', sort_order = 9 WHERE id = 30;  -- Agua

-- Flags visuales derivados de la categoría (COALESCE por filas sin categoría).
UPDATE drinks SET
  trending = COALESCE(category_id = 'tendencias', false),
  promo = COALESCE(category_id = 'promos-combos', false);
