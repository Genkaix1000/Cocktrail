-- Categorías dinámicas con jerarquía (sort_order) + vínculo en drinks.
-- Vacía la carta demo previa; el seed de la API carga los 40 productos reales.

CREATE TABLE IF NOT EXISTS drink_categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 100,
  is_system BOOLEAN NOT NULL DEFAULT FALSE
);

ALTER TABLE drinks
  ADD COLUMN IF NOT EXISTS category_id TEXT REFERENCES drink_categories(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_drinks_category_id ON drinks (category_id);

INSERT INTO drink_categories (id, name, sort_order, is_system) VALUES
  ('cervezas', 'Cervezas', 1, true),
  ('vodkas', 'Vodkas', 2, true),
  ('whiskys', 'Whiskys', 3, true),
  ('gines', 'Gines', 4, true),
  ('tequilas-shots', 'Tequilas & Shots', 5, true),
  ('jagermeister', 'Jägermeister', 6, true),
  ('tragos-aperitivos', 'Tragos & Aperitivos', 7, true),
  ('sin-alcohol', 'Sin Alcohol & Energizantes', 8, true),
  ('promos-combos', 'Promos & Combos', 9, true)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  sort_order = EXCLUDED.sort_order,
  is_system = EXCLUDED.is_system;

-- Reemplazo total de la carta demo (ids/nombres viejos) por el seed real en boot.
DELETE FROM drinks;

REVOKE ALL PRIVILEGES ON TABLE drink_categories FROM anon, authenticated;
GRANT ALL PRIVILEGES ON TABLE drink_categories TO postgres, service_role;
ALTER TABLE drink_categories ENABLE ROW LEVEL SECURITY;
