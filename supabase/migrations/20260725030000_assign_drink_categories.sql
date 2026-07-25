-- Backfill: la carta se seedó sin category_id; solo Tendencias quedó asignada.
-- Rellena el resto según la carta real y deriva flags promo/trending.

UPDATE drinks SET category_id = 'vodkas' WHERE id IN (3, 6);
UPDATE drinks SET category_id = 'whiskys' WHERE id IN (7, 8, 9, 10);
UPDATE drinks SET category_id = 'gines' WHERE id IN (12, 13, 14, 15);
UPDATE drinks SET category_id = 'tequilas-shots' WHERE id IN (16, 17, 18);
UPDATE drinks SET category_id = 'jagermeister' WHERE id IN (19, 21);
UPDATE drinks SET category_id = 'tragos-aperitivos' WHERE id IN (23, 24, 25, 26, 27, 28, 29);
UPDATE drinks SET category_id = 'sin-alcohol' WHERE id IN (31, 32, 33);
UPDATE drinks SET category_id = 'promos-combos' WHERE id IN (35, 36, 37, 38, 39, 40);

UPDATE drinks SET
  trending = COALESCE(category_id = 'tendencias', false),
  promo = COALESCE(category_id = 'promos-combos', false);
