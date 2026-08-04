-- 20260722000300_repair_checksum_drift.sql
-- Repara el drift de checksum de 3 migraciones ya aplicadas. El drift lo causó
-- un sed sobre COMENTARIOS (rename docs/specs/… → docs/specs/mercadopago/…,
-- commit 92ab34c) — cero DDL, verificado diffeando. Sin esto, isDegraded()
-- queda true para siempre y se pierde la señal del banner de /admin justo en
-- el deploy que arregla un bug de plata.
--
-- Los hashes nuevos se calcularon EXACTAMENTE como el runner
-- (apps/api/src/infra/migrations/migration-runner.ts → readMigrationFiles):
-- sha256 hex del contenido del archivo con EOL normalizado (\r\n → \n).
-- El WHERE incluye el checksum viejo para que la corrida sea idempotente y
-- para no pisar un registro que no sea el que se auditó. En una corrida
-- baseline (tabla vacía) matchea 0 filas: los archivos ya se registran con el
-- checksum actual.
--
-- REGLA (queda escrita acá): PROHIBIDO tocar migraciones ya aplicadas, aunque
-- el cambio sea un comentario.

-- Guarda 2026-08-03: en un ambiente donde el runner de la app (schema_migrations)
-- nunca corrió (ej. Supabase Cloud, cuyo esquema se maneja por `supabase db
-- push`), la tabla no existe — no hay drift que reparar ahí, no-op seguro.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'schema_migrations') THEN
    UPDATE schema_migrations
    SET checksum = '1ed771e174ebbcaaf73ad20a3b12c557269ca5a6ec8cefa557d1073bd80458dc'
    WHERE version = '20260715000000_bars.sql'
      AND checksum = '33eb4d2f03e8cd79910b923e15f684adc936a0e1babc746fe8e023cc8e99ed8f';

    UPDATE schema_migrations
    SET checksum = '24d3dd28d6da2aae37e2f4af4fa5cf77eea2d62f861adc6906cb62adef59d458'
    WHERE version = '20260715000200_mercadopago_cajas.sql'
      AND checksum = 'f6df6fc7910f998f46da359c89944865e555e7375671eb5369c8cb71d7010f5b';

    UPDATE schema_migrations
    SET checksum = 'e78302df121e54c07fa5200acddd9bea62c5a3abfbe585bf87621905cc29217d'
    WHERE version = '20260715000300_mercadopago_cajas_devices.sql'
      AND checksum = '62799e0c641a074c21c7d4c3c2043dece2efa8a4198d52079539d68ca718f5ae';
  END IF;
END $$;
