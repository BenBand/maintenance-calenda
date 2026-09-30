-- 000014_remove_cost_fields_add_tracking.sql
-- Purpose: Remove all cost/money fields and add internal tracking fields
-- since maintenance is strictly internal company work
--
-- Changes:
--   * Remove estimated_cost from maintenance_schedules
--   * Remove labor_cost, parts_cost, downtime_minutes from service_records
--   * Drop maintenance_costs table entirely
--   * Remove purchase_cost from assets
--   * Add internal tracking fields to service_records:
--     - time_spent_minutes: actual time spent on the task
--     - complexity_level: simple/medium/complex
--     - parts_replaced: text description of parts replaced
--     - next_maintenance_due: suggested next maintenance date
--   * Add condition_rating to assets for tracking asset health

-- ---------------------------------------------------------------------------
-- Remove cost columns from maintenance_schedules
-- ---------------------------------------------------------------------------

ALTER TABLE maintenance_schedules DROP COLUMN IF EXISTS estimated_cost;

-- ---------------------------------------------------------------------------
-- Remove cost columns from service_records, add tracking fields
-- ---------------------------------------------------------------------------

ALTER TABLE service_records DROP COLUMN IF EXISTS total_cost;
ALTER TABLE service_records DROP COLUMN IF EXISTS labor_cost;
ALTER TABLE service_records DROP COLUMN IF EXISTS parts_cost;
ALTER TABLE service_records DROP COLUMN IF EXISTS downtime_minutes;

ALTER TABLE service_records
  ADD COLUMN IF NOT EXISTS time_spent_minutes INTEGER DEFAULT 0 CHECK (time_spent_minutes >= 0),
  ADD COLUMN IF NOT EXISTS complexity_level VARCHAR(20) CHECK (complexity_level IN ('simple', 'medium', 'complex')),
  ADD COLUMN IF NOT EXISTS parts_replaced TEXT,
  ADD COLUMN IF NOT EXISTS next_maintenance_due DATE;

-- ---------------------------------------------------------------------------
-- Drop maintenance_costs table
-- ---------------------------------------------------------------------------

DROP INDEX IF EXISTS idx_costs_schedule;
DROP INDEX IF EXISTS idx_costs_asset;
DROP TABLE IF EXISTS maintenance_costs;

-- ---------------------------------------------------------------------------
-- Remove purchase_cost from assets
-- ---------------------------------------------------------------------------

ALTER TABLE assets DROP COLUMN IF EXISTS purchase_cost;

-- ---------------------------------------------------------------------------
-- Add condition_rating to assets
-- ---------------------------------------------------------------------------

ALTER TABLE assets
  ADD COLUMN IF NOT EXISTS condition_rating VARCHAR(20) DEFAULT 'good' CHECK (condition_rating IN ('excellent', 'good', 'fair', 'poor', 'critical'));

-- ---------------------------------------------------------------------------
-- Indexes for new fields
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_service_time_spent ON service_records(time_spent_minutes);
CREATE INDEX IF NOT EXISTS idx_service_complexity ON service_records(complexity_level);
CREATE INDEX IF NOT EXISTS idx_service_next_maintenance ON service_records(next_maintenance_due);
CREATE INDEX IF NOT EXISTS idx_assets_condition ON assets(condition_rating);

-- ---------------------------------------------------------------------------
-- updated_at maintenance for new columns
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS trg_service_updated_at ON service_records;
CREATE TRIGGER trg_service_updated_at
  BEFORE UPDATE ON service_records
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_assets_updated_at ON assets;
CREATE TRIGGER trg_assets_updated_at
  BEFORE UPDATE ON assets
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();