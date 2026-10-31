-- Up Migration
-- Auth sessions can exist before the optional device-registration flow.
ALTER TABLE echo.sessions ALTER COLUMN device_id DROP NOT NULL;

-- Down Migration
DELETE FROM echo.sessions WHERE device_id IS NULL;
ALTER TABLE echo.sessions ALTER COLUMN device_id SET NOT NULL;
