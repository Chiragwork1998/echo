-- Up Migration

CREATE SEQUENCE echo.sync_change_sequence AS bigint;
REVOKE ALL ON SEQUENCE echo.sync_change_sequence FROM PUBLIC;

DO $revoke_sequence_roles$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON SEQUENCE echo.sync_change_sequence FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON SEQUENCE echo.sync_change_sequence FROM authenticated;
  END IF;
END
$revoke_sequence_roles$;

ALTER TABLE echo.sync_items
  ADD COLUMN change_sequence bigint NOT NULL DEFAULT nextval('echo.sync_change_sequence');

CREATE TABLE echo.sync_item_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES echo.accounts (id) ON DELETE CASCADE,
  sync_item_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('entry', 'reflection', 'audio', 'profile', 'settings')),
  revision bigint NOT NULL CHECK (revision > 0),
  updated_at timestamptz NOT NULL,
  deleted_at timestamptz,
  ciphertext bytea,
  nonce bytea,
  algorithm text,
  content_hash bytea,
  created_by_device_id uuid NOT NULL,
  archive_reason text NOT NULL CHECK (archive_reason IN ('replaced', 'conflict')),
  archived_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, id),
  FOREIGN KEY (account_id, sync_item_id)
    REFERENCES echo.sync_items (account_id, id) ON DELETE CASCADE,
  FOREIGN KEY (account_id, created_by_device_id)
    REFERENCES echo.devices (account_id, id),
  CHECK (deleted_at IS NULL OR deleted_at >= updated_at),
  CHECK (
    (deleted_at IS NULL AND ciphertext IS NOT NULL AND octet_length(ciphertext) > 0
      AND nonce IS NOT NULL AND octet_length(nonce) > 0
      AND algorithm = 'A256GCM'
      AND content_hash IS NOT NULL AND octet_length(content_hash) > 0)
    OR
    (deleted_at IS NOT NULL AND ciphertext IS NULL AND nonce IS NULL
      AND algorithm IS NULL AND content_hash IS NULL)
  )
);

CREATE FUNCTION echo.archive_sync_item_revision()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, echo
AS $function$
BEGIN
  IF NEW.account_id <> OLD.account_id OR NEW.id <> OLD.id THEN
    RAISE EXCEPTION 'sync item ownership and identity are immutable'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.revision <= OLD.revision THEN
    RAISE EXCEPTION 'sync revision must increase'
      USING ERRCODE = '23514';
  END IF;

  INSERT INTO echo.sync_item_revisions (
    account_id, sync_item_id, kind, revision, updated_at, deleted_at,
    ciphertext, nonce, algorithm, content_hash, created_by_device_id,
    archive_reason
  ) VALUES (
    OLD.account_id, OLD.id, OLD.kind, OLD.revision, OLD.updated_at,
    OLD.deleted_at, OLD.ciphertext, OLD.nonce, OLD.algorithm,
    OLD.content_hash, OLD.created_by_device_id, 'replaced'
  );

  NEW.change_sequence := nextval('echo.sync_change_sequence');
  RETURN NEW;
END
$function$;

CREATE TRIGGER sync_items_archive_revision
BEFORE UPDATE ON echo.sync_items
FOR EACH ROW EXECUTE FUNCTION echo.archive_sync_item_revision();

CREATE FUNCTION echo.reject_immutable_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $function$
BEGIN
  RAISE EXCEPTION 'immutable history rows cannot be updated'
    USING ERRCODE = '23514';
END
$function$;

CREATE TRIGGER consent_records_immutable
BEFORE UPDATE ON echo.consent_records
FOR EACH ROW EXECUTE FUNCTION echo.reject_immutable_update();

CREATE TRIGGER sync_item_revisions_immutable
BEFORE UPDATE ON echo.sync_item_revisions
FOR EACH ROW EXECUTE FUNCTION echo.reject_immutable_update();

ALTER TABLE echo.sessions
  ADD CONSTRAINT sessions_refresh_hash_unique UNIQUE (refresh_credential_hash);

ALTER TABLE echo.stored_objects
  ADD CONSTRAINT stored_objects_account_path_check CHECK (
    storage_key LIKE account_id::text || '/%'
    AND storage_key NOT LIKE '%..%'
    AND char_length(storage_key) <= 512
  );

ALTER TABLE echo.export_jobs
  ADD CONSTRAINT export_jobs_state_timestamps_check CHECK (
    (status = 'pending' AND started_at IS NULL AND completed_at IS NULL AND failure_code IS NULL AND object_id IS NULL)
    OR (status = 'processing' AND started_at IS NOT NULL AND completed_at IS NULL AND failure_code IS NULL AND object_id IS NULL)
    OR (status = 'complete' AND started_at IS NOT NULL AND completed_at IS NOT NULL AND failure_code IS NULL AND object_id IS NOT NULL)
    OR (status = 'failed' AND started_at IS NOT NULL AND completed_at IS NOT NULL AND length(failure_code) > 0 AND object_id IS NULL)
    OR (status = 'expired' AND completed_at IS NOT NULL AND object_id IS NULL)
  );

ALTER TABLE echo.deletion_jobs
  ADD CONSTRAINT deletion_jobs_state_timestamps_check CHECK (
    (status = 'pending' AND started_at IS NULL AND completed_at IS NULL AND failure_code IS NULL)
    OR (status = 'processing' AND started_at IS NOT NULL AND completed_at IS NULL AND failure_code IS NULL)
    OR (status = 'complete' AND started_at IS NOT NULL AND completed_at IS NOT NULL AND failure_code IS NULL)
    OR (status = 'failed' AND started_at IS NOT NULL AND completed_at IS NOT NULL AND length(failure_code) > 0)
  );

ALTER TABLE echo.reflection_jobs
  ADD CONSTRAINT reflection_jobs_state_timestamps_check CHECK (
    (status = 'pending' AND started_at IS NULL AND completed_at IS NULL AND failure_code IS NULL AND result_sync_item_id IS NULL)
    OR (status = 'processing' AND started_at IS NOT NULL AND completed_at IS NULL AND failure_code IS NULL AND result_sync_item_id IS NULL)
    OR (status = 'complete' AND started_at IS NOT NULL AND completed_at IS NOT NULL AND failure_code IS NULL AND result_sync_item_id IS NOT NULL)
    OR (status = 'failed' AND started_at IS NOT NULL AND completed_at IS NOT NULL AND length(failure_code) > 0 AND result_sync_item_id IS NULL)
    OR (status = 'expired' AND completed_at IS NOT NULL AND result_sync_item_id IS NULL)
  );

CREATE INDEX sync_items_cursor_idx
  ON echo.sync_items (account_id, change_sequence, id);
CREATE INDEX sync_items_tombstone_cleanup_idx
  ON echo.sync_items (deleted_at, account_id, id) WHERE deleted_at IS NOT NULL;
CREATE INDEX sync_item_revisions_conflict_idx
  ON echo.sync_item_revisions (account_id, sync_item_id, revision DESC, archived_at DESC);
CREATE INDEX sync_item_revisions_cleanup_idx
  ON echo.sync_item_revisions (archived_at, account_id, sync_item_id);
CREATE INDEX sync_item_revisions_device_owner_idx
  ON echo.sync_item_revisions (account_id, created_by_device_id);
CREATE INDEX sessions_expiry_cleanup_idx
  ON echo.sessions (expires_at, account_id) WHERE revoked_at IS NULL;
CREATE INDEX stored_objects_cleanup_idx
  ON echo.stored_objects (deleted_at, account_id) WHERE deleted_at IS NOT NULL;
CREATE INDEX export_jobs_worker_idx
  ON echo.export_jobs (requested_at, id) WHERE status IN ('pending', 'processing');
CREATE INDEX export_jobs_expiry_cleanup_idx
  ON echo.export_jobs (expires_at, account_id) WHERE expires_at IS NOT NULL;
CREATE INDEX reflection_jobs_expiry_cleanup_idx
  ON echo.reflection_jobs (expires_at, account_id) WHERE expires_at IS NOT NULL;

ALTER TABLE echo.sync_item_revisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE echo.sync_item_revisions FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION echo.archive_sync_item_revision() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION echo.reject_immutable_update() FROM PUBLIC;

DO $revoke_optional_roles$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE echo.sync_item_revisions FROM anon;
    REVOKE EXECUTE ON FUNCTION echo.archive_sync_item_revision() FROM anon;
    REVOKE EXECUTE ON FUNCTION echo.reject_immutable_update() FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE echo.sync_item_revisions FROM authenticated;
    REVOKE EXECUTE ON FUNCTION echo.archive_sync_item_revision() FROM authenticated;
    REVOKE EXECUTE ON FUNCTION echo.reject_immutable_update() FROM authenticated;
  END IF;
END
$revoke_optional_roles$;

-- Down Migration
DROP TRIGGER IF EXISTS sync_item_revisions_immutable ON echo.sync_item_revisions;
DROP TRIGGER IF EXISTS consent_records_immutable ON echo.consent_records;
DROP TRIGGER IF EXISTS sync_items_archive_revision ON echo.sync_items;
DROP FUNCTION IF EXISTS echo.reject_immutable_update();
DROP FUNCTION IF EXISTS echo.archive_sync_item_revision();
ALTER TABLE echo.reflection_jobs DROP CONSTRAINT IF EXISTS reflection_jobs_state_timestamps_check;
ALTER TABLE echo.deletion_jobs DROP CONSTRAINT IF EXISTS deletion_jobs_state_timestamps_check;
ALTER TABLE echo.export_jobs DROP CONSTRAINT IF EXISTS export_jobs_state_timestamps_check;
ALTER TABLE echo.stored_objects DROP CONSTRAINT IF EXISTS stored_objects_account_path_check;
ALTER TABLE echo.sessions DROP CONSTRAINT IF EXISTS sessions_refresh_hash_unique;
DROP TABLE IF EXISTS echo.sync_item_revisions;
ALTER TABLE echo.sync_items DROP COLUMN IF EXISTS change_sequence;
DROP SEQUENCE IF EXISTS echo.sync_change_sequence;
