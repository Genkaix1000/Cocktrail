-- Actualiza nombres e imágenes para la categoría Tendencias en la base de datos Supabase
UPDATE drinks SET image = '/drinks/andes_origen.webp' WHERE id = 1;
UPDATE drinks SET image = '/drinks/absolut_speed.webp' WHERE id = 5;
UPDATE drinks SET name = 'Gin Fisherman', image = '/drinks/gin_fisherman.webp' WHERE id = 11;
UPDATE drinks SET image = '/drinks/agua_mineral.webp' WHERE id = 30;
UPDATE drinks SET name = 'Champagne Renaissance + 2 Speed', image = '/drinks/champagne_renaissance_speed.webp' WHERE id = 34;
