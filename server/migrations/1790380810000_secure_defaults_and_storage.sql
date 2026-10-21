-- Up Migration

ALTER DEFAULT PRIVILEGES IN SCHEMA echo REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA echo REVOKE ALL ON SEQUENCES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA echo REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

DO $secure_defaults$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA echo REVOKE ALL ON TABLES FROM anon';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA echo REVOKE ALL ON SEQUENCES FROM anon';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA echo REVOKE EXECUTE ON FUNCTIONS FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA echo REVOKE ALL ON TABLES FROM authenticated';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA echo REVOKE ALL ON SEQUENCES FROM authenticated';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA echo REVOKE EXECUTE ON FUNCTIONS FROM authenticated';
  END IF;

  IF to_regclass('storage.buckets') IS NOT NULL THEN
    INSERT INTO storage.buckets (
      id, name, public, file_size_limit, allowed_mime_types
    ) VALUES (
      'echo-private', 'echo-private', false, 52428800,
      ARRAY['application/octet-stream']::text[]
    )
    ON CONFLICT (id) DO UPDATE SET
      public = false,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;
  END IF;
END
$secure_defaults$;

-- Down Migration
DO $remove_empty_bucket$
BEGIN
  IF to_regclass('storage.buckets') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM storage.objects WHERE bucket_id = 'echo-private'
    ) THEN
      DELETE FROM storage.buckets WHERE id = 'echo-private';
    END IF;
  END IF;
END
$remove_empty_bucket$;
