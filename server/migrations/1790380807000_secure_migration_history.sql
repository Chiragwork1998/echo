-- Up Migration
-- Migration history is operational metadata and must not be readable or
-- writable through Supabase client roles.
REVOKE ALL ON TABLE public.pgmigrations FROM PUBLIC;

DO $secure_migration_history$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE public.pgmigrations FROM anon;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE public.pgmigrations FROM authenticated;
  END IF;
END
$secure_migration_history$;

ALTER TABLE public.pgmigrations ENABLE ROW LEVEL SECURITY;

-- Down Migration
-- Intentionally retain the least-privilege posture during rollback.
SELECT 1;
