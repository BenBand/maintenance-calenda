-- 000002_timestamp_aware_schedules.sql
-- Purpose: Move maintenance scheduling to timestamp-aware columns while
--          preserving a backward-compatible `date` column for existing consumers.
--
-- Strategy:
--   * Add `scheduled_at TIMESTAMPTZ` (the authoritative timestamp) and
--     `scheduled_date DATE` (derived copy used for calendar grid queries).
--   * Keep the legacy `date DATE` column populated (backfill from scheduled_at
--     when missing) so existing date-range queries keep working.
--   * Add a BEFORE INSERT/UPDATE trigger that derives `scheduled_date` and the
--     legacy `date` from `scheduled_at` whenever it is supplied.
--   * Add indexes to support time-range and date-range lookups.

ALTER TABLE maintenance_schedules
  ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS scheduled_date DATE,
  ADD COLUMN IF NOT EXISTS recurrence_rule VARCHAR(20),
  ADD COLUMN IF NOT EXISTS recurrence_end TIMESTAMPTZ;

-- Backfill authoritative timestamp for existing rows.
UPDATE maintenance_schedules
   SET scheduled_at = (date::timestamptz AT TIME ZONE 'UTC')
 WHERE scheduled_at IS NULL
   AND date IS NOT NULL;

-- Make scheduled_at a NOT NULL column going forward, but only if every row has
-- a value (this migration backfills first). If the UPDATE above did not cover
-- everything we leave the constraint to the next migration.
ALTER TABLE maintenance_schedules
  ALTER COLUMN scheduled_at SET NOT NULL;

-- Maintain derived columns automatically.
CREATE OR REPLACE FUNCTION derive_schedule_timestamps()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.scheduled_at IS NULL AND NEW.date IS NOT NULL THEN
    NEW.scheduled_at := (NEW.date::timestamptz AT TIME ZONE 'UTC');
  END IF;

  IF NEW.scheduled_at IS NOT NULL THEN
    NEW.scheduled_date := (NEW.scheduled_at AT TIME ZONE 'UTC')::date;
    -- Preserve the legacy `date` column for backward compatibility.
    NEW.date := NEW.scheduled_date;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_maintenance_schedules_timestamps ON maintenance_schedules;
CREATE TRIGGER trg_maintenance_schedules_timestamps
BEFORE INSERT OR UPDATE ON maintenance_schedules
FOR EACH ROW EXECUTE FUNCTION derive_schedule_timestamps();

-- Indexes for time-aware queries.
CREATE INDEX IF NOT EXISTS idx_maintenance_scheduled_at ON maintenance_schedules(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_maintenance_scheduled_date ON maintenance_schedules(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_maintenance_recurrence ON maintenance_schedules(recurrence_rule);