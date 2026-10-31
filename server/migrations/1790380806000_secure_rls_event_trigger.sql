-- Up Migration
-- Supabase installs this event-trigger function to enable RLS on new public
-- tables. It must not be callable through the Data API.
DO $secure_rls_event_trigger$
BEGIN
  IF to_regprocedure('public.rls_auto_enable()') IS NOT NULL THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC';

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      EXECUTE 'REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM anon';
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE 'REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM authenticated';
    END IF;
  END IF;
END
$secure_rls_event_trigger$;

-- Down Migration
-- Intentionally do not restore public execution of a SECURITY DEFINER event
-- trigger. This privilege reduction is safe to retain during rollback.
SELECT 1;
