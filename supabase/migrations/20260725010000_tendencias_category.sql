-- Unifica etiquetas → categorías: Tendencias (arriba) + renombra Promos.
-- Los flags promo/trending en drinks quedan como cache visual derivado de category_id.

INSERT INTO drink_categories (id, name, sort_order, is_system) VALUES
  ('tendencias', 'Tendencias', 1, true)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  sort_order = EXCLUDED.sort_order,
  is_system = EXCLUDED.is_system;

UPDATE drink_categories SET sort_order = 2, name = 'Cervezas' WHERE id = 'cervezas';
UPDATE drink_categories SET sort_order = 3 WHERE id = 'vodkas';
UPDATE drink_categories SET sort_order = 4 WHERE id = 'whiskys';
UPDATE drink_categories SET sort_order = 5 WHERE id = 'gines';
UPDATE drink_categories SET sort_order = 6 WHERE id = 'tequilas-shots';
UPDATE drink_categories SET sort_order = 7 WHERE id = 'jagermeister';
UPDATE drink_categories SET sort_order = 8 WHERE id = 'tragos-aperitivos';
UPDATE drink_categories SET sort_order = 9 WHERE id = 'sin-alcohol';
UPDATE drink_categories
   SET sort_order = 10, name = 'Promos'
 WHERE id = 'promos-combos';
