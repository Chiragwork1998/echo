-- Up Migration

-- Keep this migration independently safe to apply after the schema baseline.
CREATE SCHEMA IF NOT EXISTS echo;

-- ECHO's application data is private. Fastify connects directly to PostgreSQL;
-- this schema must not be added to Supabase's Data API exposed schemas.

CREATE TABLE echo.accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'deletion_pending', 'deleted')),
  display_name text,
  locale text NOT NULL DEFAULT 'en',
  timezone text NOT NULL DEFAULT 'UTC',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CHECK ((status = 'deleted') = (deleted_at IS NOT NULL)),
  CHECK (updated_at >= created_at)
);

CREATE TABLE echo.auth_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES echo.accounts (id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('apple', 'google', 'email')),
  provider_subject text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_authenticated_at timestamptz,
  UNIQUE (provider, provider_subject),
  UNIQUE (account_id, id)
);

CREATE TABLE echo.devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES echo.accounts (id) ON DELETE CASCADE,
  public_key bytea NOT NULL CHECK (octet_length(public_key) > 0),
  platform text NOT NULL CHECK (platform IN ('ios', 'android')),
  app_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  UNIQUE (account_id, id),
  CHECK (last_seen_at >= created_at),
  CHECK (revoked_at IS NULL OR revoked_at >= created_at)
);

CREATE TABLE echo.sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES echo.accounts (id) ON DELETE CASCADE,
  device_id uuid NOT NULL,
  refresh_credential_hash bytea NOT NULL CHECK (octet_length(refresh_credential_hash) > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  rotated_at timestamptz,
  revoked_at timestamptz,
  UNIQUE (account_id, id),
  FOREIGN KEY (account_id, device_id) REFERENCES echo.devices (account_id, id) ON DELETE CASCADE,
  CHECK (expires_at > created_at),
  CHECK (rotated_at IS NULL OR rotated_at >= created_at),
  CHECK (revoked_at IS NULL OR revoked_at >= created_at)
);

CREATE TABLE echo.sync_items (
  id uuid NOT NULL,
  account_id uuid NOT NULL REFERENCES echo.accounts (id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('entry', 'reflection', 'audio', 'profile', 'settings')),
  revision bigint NOT NULL CHECK (revision > 0),
  updated_at timestamptz NOT NULL,
  deleted_at timestamptz,
  ciphertext bytea,
  nonce bytea,
  algorithm text,
  content_hash bytea,
  created_by_device_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, id),
  FOREIGN KEY (account_id, created_by_device_id) REFERENCES echo.devices (account_id, id),
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

CREATE TABLE echo.sync_cursors (
  account_id uuid NOT NULL REFERENCES echo.accounts (id) ON DELETE CASCADE,
  device_id uuid NOT NULL,
  cursor bigint NOT NULL DEFAULT 0 CHECK (cursor >= 0),
  acknowledged_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, device_id),
  FOREIGN KEY (account_id, device_id) REFERENCES echo.devices (account_id, id) ON DELETE CASCADE
);

CREATE TABLE echo.recovery_envelopes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL UNIQUE REFERENCES echo.accounts (id) ON DELETE CASCADE,
  ciphertext bytea NOT NULL CHECK (octet_length(ciphertext) > 0),
  nonce bytea NOT NULL CHECK (octet_length(nonce) > 0),
  algorithm text NOT NULL CHECK (algorithm = 'A256GCM'),
  content_hash bytea NOT NULL CHECK (octet_length(content_hash) > 0),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, id),
  CHECK (updated_at >= created_at)
);

CREATE TABLE echo.consent_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES echo.accounts (id) ON DELETE CASCADE,
  consent_type text NOT NULL CHECK (consent_type IN ('private_backup', 'ai_reflection', 'analytics', 'terms', 'privacy')),
  policy_version text NOT NULL CHECK (length(policy_version) > 0),
  granted boolean NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  UNIQUE (account_id, id),
  CHECK ((granted AND revoked_at IS NULL) OR (NOT granted)),
  CHECK (revoked_at IS NULL OR revoked_at >= recorded_at)
);

CREATE TABLE echo.stored_objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES echo.accounts (id) ON DELETE CASCADE,
  sync_item_id uuid,
  object_type text NOT NULL CHECK (object_type IN ('audio', 'sync_payload', 'export')),
  storage_key text NOT NULL UNIQUE CHECK (length(storage_key) > 0),
  size_bytes bigint NOT NULL CHECK (size_bytes >= 0),
  content_hash bytea NOT NULL CHECK (octet_length(content_hash) > 0),
  nonce bytea NOT NULL CHECK (octet_length(nonce) > 0),
  algorithm text NOT NULL CHECK (algorithm = 'A256GCM'),
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (account_id, id),
  FOREIGN KEY (account_id, sync_item_id) REFERENCES echo.sync_items (account_id, id) ON DELETE CASCADE,
  CHECK (deleted_at IS NULL OR deleted_at >= created_at)
);

CREATE TABLE echo.export_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES echo.accounts (id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'complete', 'failed', 'expired')),
  object_id uuid,
  requested_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  expires_at timestamptz,
  failure_code text,
  UNIQUE (account_id, id),
  FOREIGN KEY (account_id, object_id) REFERENCES echo.stored_objects (account_id, id),
  CHECK (started_at IS NULL OR started_at >= requested_at),
  CHECK (completed_at IS NULL OR completed_at >= requested_at),
  CHECK (expires_at IS NULL OR expires_at >= requested_at),
  CHECK ((status = 'complete') = (object_id IS NOT NULL))
);

CREATE TABLE echo.deletion_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES echo.accounts (id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'complete', 'failed')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  failure_code text,
  UNIQUE (account_id, id),
  CHECK (started_at IS NULL OR started_at >= requested_at),
  CHECK (completed_at IS NULL OR completed_at >= requested_at)
);

CREATE TABLE echo.reflection_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES echo.accounts (id) ON DELETE CASCADE,
  source_sync_item_id uuid NOT NULL,
  result_sync_item_id uuid,
  consent_record_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'complete', 'failed', 'expired')),
  provider text NOT NULL,
  provider_region text NOT NULL,
  model_identifier text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  expires_at timestamptz,
  failure_code text,
  UNIQUE (account_id, id),
  FOREIGN KEY (account_id, source_sync_item_id) REFERENCES echo.sync_items (account_id, id),
  FOREIGN KEY (account_id, result_sync_item_id) REFERENCES echo.sync_items (account_id, id),
  FOREIGN KEY (account_id, consent_record_id) REFERENCES echo.consent_records (account_id, id),
  CHECK (started_at IS NULL OR started_at >= requested_at),
  CHECK (completed_at IS NULL OR completed_at >= requested_at),
  CHECK (expires_at IS NULL OR expires_at >= requested_at),
  CHECK ((status = 'complete') = (result_sync_item_id IS NOT NULL))
);

CREATE TABLE echo.idempotency_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES echo.accounts (id) ON DELETE CASCADE,
  scope text NOT NULL,
  idempotency_key text NOT NULL,
  request_hash bytea NOT NULL CHECK (octet_length(request_hash) > 0),
  state text NOT NULL DEFAULT 'processing' CHECK (state IN ('processing', 'complete', 'failed')),
  response_status integer CHECK (response_status BETWEEN 100 AND 599),
  resource_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  UNIQUE (account_id, scope, idempotency_key),
  UNIQUE (account_id, id),
  CHECK (length(scope) > 0 AND length(idempotency_key) > 0),
  CHECK (expires_at > created_at),
  CHECK ((state = 'processing' AND response_status IS NULL) OR (state <> 'processing' AND response_status IS NOT NULL))
);

CREATE INDEX auth_identities_account_idx ON echo.auth_identities (account_id);
CREATE INDEX devices_account_active_idx ON echo.devices (account_id, last_seen_at DESC) WHERE revoked_at IS NULL;
CREATE INDEX sessions_account_active_idx ON echo.sessions (account_id, expires_at) WHERE revoked_at IS NULL;
CREATE INDEX sync_items_pull_idx ON echo.sync_items (account_id, updated_at, id);
CREATE INDEX sync_items_account_kind_idx ON echo.sync_items (account_id, kind) WHERE deleted_at IS NULL;
CREATE INDEX consent_records_latest_idx ON echo.consent_records (account_id, consent_type, recorded_at DESC);
CREATE INDEX stored_objects_account_idx ON echo.stored_objects (account_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX export_jobs_account_idx ON echo.export_jobs (account_id, requested_at DESC);
CREATE INDEX deletion_jobs_status_idx ON echo.deletion_jobs (status, requested_at) WHERE status IN ('pending', 'processing');
CREATE INDEX reflection_jobs_account_idx ON echo.reflection_jobs (account_id, requested_at DESC);
CREATE INDEX reflection_jobs_status_idx ON echo.reflection_jobs (status, requested_at) WHERE status IN ('pending', 'processing');
CREATE INDEX idempotency_records_expiry_idx ON echo.idempotency_records (expires_at);

REVOKE ALL ON SCHEMA echo FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA echo FROM PUBLIC;

DO $revoke_supabase_roles$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON SCHEMA echo FROM anon;
    REVOKE ALL ON ALL TABLES IN SCHEMA echo FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON SCHEMA echo FROM authenticated;
    REVOKE ALL ON ALL TABLES IN SCHEMA echo FROM authenticated;
  END IF;
END
$revoke_supabase_roles$;

-- Down Migration
DROP TABLE IF EXISTS echo.idempotency_records;
DROP TABLE IF EXISTS echo.reflection_jobs;
DROP TABLE IF EXISTS echo.deletion_jobs;
DROP TABLE IF EXISTS echo.export_jobs;
DROP TABLE IF EXISTS echo.stored_objects;
DROP TABLE IF EXISTS echo.consent_records;
DROP TABLE IF EXISTS echo.recovery_envelopes;
DROP TABLE IF EXISTS echo.sync_cursors;
DROP TABLE IF EXISTS echo.sync_items;
DROP TABLE IF EXISTS echo.sessions;
DROP TABLE IF EXISTS echo.devices;
DROP TABLE IF EXISTS echo.auth_identities;
DROP TABLE IF EXISTS echo.accounts;
