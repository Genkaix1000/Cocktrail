-- 20260723000300_revoke_anon_all_tables.sql
-- Ciberseguridad: Revocar acceso PostgREST (anon, authenticated) en TODAS las tablas del esquema public.
-- En Cocktrail, todas las peticiones legítimas se procesan desde la API Express usando `service_role`.
-- Este script recorre dinámicamente el esquema public, remueve privilegios anónimos y asegura RLS.

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM anon, authenticated', r.tablename);
    EXECUTE format('GRANT ALL PRIVILEGES ON TABLE public.%I TO postgres, service_role', r.tablename);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.tablename);
  END LOOP;
END $$;
