-- 000001_create_updated_at_triggers.sql
-- Purpose: Add `updated_at` trigger functions and row-level triggers to every
--          business table so `updated_at` is maintained automatically on UPDATE.
-- Safe to re-run: uses CREATE OR REPLACE FUNCTION and DROP TRIGGER IF EXISTS.

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- maintenance_schedules
DROP TRIGGER IF EXISTS trg_maintenance_schedules_updated_at ON maintenance_schedules;
CREATE TRIGGER trg_maintenance_schedules_updated_at
BEFORE UPDATE ON maintenance_schedules
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- service_records
DROP TRIGGER IF EXISTS trg_service_records_updated_at ON service_records;
CREATE TRIGGER trg_service_records_updated_at
BEFORE UPDATE ON service_records
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- incidents
DROP TRIGGER IF EXISTS trg_incidents_updated_at ON incidents;
CREATE TRIGGER trg_incidents_updated_at
BEFORE UPDATE ON incidents
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- users
DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
CREATE TRIGGER trg_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION set_updated_at();