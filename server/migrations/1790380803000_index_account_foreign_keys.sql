-- Up Migration
CREATE INDEX sessions_device_owner_idx
  ON echo.sessions (account_id, device_id);
CREATE INDEX sync_items_device_owner_idx
  ON echo.sync_items (account_id, created_by_device_id);
CREATE INDEX stored_objects_sync_item_owner_idx
  ON echo.stored_objects (account_id, sync_item_id);
CREATE INDEX export_jobs_object_owner_idx
  ON echo.export_jobs (account_id, object_id);
CREATE INDEX reflection_jobs_source_owner_idx
  ON echo.reflection_jobs (account_id, source_sync_item_id);
CREATE INDEX reflection_jobs_result_owner_idx
  ON echo.reflection_jobs (account_id, result_sync_item_id);
CREATE INDEX reflection_jobs_consent_owner_idx
  ON echo.reflection_jobs (account_id, consent_record_id);

-- Down Migration
DROP INDEX IF EXISTS echo.reflection_jobs_consent_owner_idx;
DROP INDEX IF EXISTS echo.reflection_jobs_result_owner_idx;
DROP INDEX IF EXISTS echo.reflection_jobs_source_owner_idx;
DROP INDEX IF EXISTS echo.export_jobs_object_owner_idx;
DROP INDEX IF EXISTS echo.stored_objects_sync_item_owner_idx;
DROP INDEX IF EXISTS echo.sync_items_device_owner_idx;
DROP INDEX IF EXISTS echo.sessions_device_owner_idx;
