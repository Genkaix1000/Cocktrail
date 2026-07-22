-- 20260723000200_bars_rls.sql
-- A2 (PR 4): 20260715000000_bars.sql dejó bars con GRANT ALL a anon/authenticated
-- y sin RLS. Nadie usa la anon key (los clientes de shared/supabase.ts usan
-- SERVICE_ROLE_KEY, que bypassea RLS), así que cerramos igual que el resto:
-- RLS + policy deny + revocación dura de privilegios.

DO $$
BEGIN
  IF to_regclass('public.bars') IS NULL THEN
    RETURN;
  END IF;

  EXECUTE 'ALTER TABLE public.bars ENABLE ROW LEVEL SECURITY';
  EXECUTE 'DROP POLICY IF EXISTS bars_deny_all ON public.bars';
  EXECUTE 'CREATE POLICY bars_deny_all ON public.bars FOR ALL TO authenticated, anon USING (false)';
  EXECUTE 'REVOKE ALL PRIVILEGES ON TABLE public.bars FROM anon, authenticated';
  EXECUTE 'GRANT ALL PRIVILEGES ON TABLE public.bars TO postgres, service_role';
END $$;
