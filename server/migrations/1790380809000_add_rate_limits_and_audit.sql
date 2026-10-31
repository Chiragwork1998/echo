-- Up Migration

CREATE TABLE echo.rate_limit_buckets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES echo.accounts (id) ON DELETE CASCADE,
  scope text NOT NULL CHECK (scope IN ('auth', 'sync', 'export', 'reflection', 'deletion')),
  subject_hash bytea NOT NULL CHECK (octet_length(subject_hash) > 0),
  window_start timestamptz NOT NULL,
  request_count integer NOT NULL DEFAULT 1 CHECK (request_count > 0),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scope, subject_hash, window_start),
  CHECK (expires_at > window_start),
  CHECK (updated_at >= created_at)
);

CREATE TABLE echo.operational_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES echo.accounts (id) ON DELETE SET NULL,
  request_id uuid,
  event_type text NOT NULL CHECK (length(event_type) BETWEEN 1 AND 100),
  resource_type text CHECK (resource_type IS NULL OR length(resource_type) BETWEEN 1 AND 50),
  resource_id uuid,
  outcome text NOT NULL CHECK (outcome IN ('succeeded', 'rejected', 'failed')),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  CHECK ((resource_type IS NULL) = (resource_id IS NULL)),
  CHECK (expires_at IS NULL OR expires_at > occurred_at)
);

CREATE INDEX rate_limit_buckets_account_idx
  ON echo.rate_limit_buckets (account_id, scope, window_start DESC);
CREATE INDEX rate_limit_buckets_cleanup_idx
  ON echo.rate_limit_buckets (expires_at);
CREATE INDEX operational_audit_events_account_idx
  ON echo.operational_audit_events (account_id, occurred_at DESC);
CREATE INDEX operational_audit_events_type_idx
  ON echo.operational_audit_events (event_type, occurred_at DESC);
CREATE INDEX operational_audit_events_cleanup_idx
  ON echo.operational_audit_events (expires_at) WHERE expires_at IS NOT NULL;

ALTER TABLE echo.rate_limit_buckets ENABLE ROW LEVEL SECURITY;
ALTER TABLE echo.operational_audit_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE echo.rate_limit_buckets FROM PUBLIC;
REVOKE ALL ON TABLE echo.operational_audit_events FROM PUBLIC;

DO $revoke_optional_roles$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE echo.rate_limit_buckets FROM anon;
    REVOKE ALL ON TABLE echo.operational_audit_events FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE echo.rate_limit_buckets FROM authenticated;
    REVOKE ALL ON TABLE echo.operational_audit_events FROM authenticated;
  END IF;
END
$revoke_optional_roles$;

-- Down Migration
DROP TABLE IF EXISTS echo.operational_audit_events;
DROP TABLE IF EXISTS echo.rate_limit_buckets;
