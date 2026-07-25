-- Elimina cualquier registro residual de tragos de prueba llamado Mojito
DELETE FROM drinks WHERE LOWER(name) LIKE '%mojito%';
