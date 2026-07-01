-- Palabra clave de la noche: texto visible que se imprime en cada ticket físico
-- para que el staff distinga a simple vista tickets de la noche vigente.
ALTER TABLE night_events ADD COLUMN IF NOT EXISTS keyword TEXT;
