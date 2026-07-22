-- 20260722000200_revoke_anon_legacy.sql
-- R18: cerrar los privilegios que 20240101000000/20240102000000 le dieron a
-- anon/authenticated con GRANT ALL ON ALL TABLES (snapshot, no default privs).
-- Nadie usa la anon key (verificado: los 3 clientes de shared/supabase.ts usan
-- SERVICE_ROLE_KEY). En una corrida baseline las migraciones legacy re-abren
-- estos privilegios; este archivo (timestamp 20260722…) gana siempre por orden
-- lexicográfico. ENABLE RLS sin policies = deny-all salvo BYPASSRLS, que
-- service_role tiene.

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'night_events', 'orders', 'tickets', 'cash_sales',
    'users', 'drinks', 'app_config', 'audit_logs'
  ] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM anon, authenticated', t);
      EXECUTE format('GRANT ALL PRIVILEGES ON TABLE public.%I TO postgres, service_role', t);
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    END IF;
  END LOOP;
END $$;
