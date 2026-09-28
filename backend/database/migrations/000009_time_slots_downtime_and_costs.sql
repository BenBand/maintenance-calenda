-- 000009_time_slots_downtime_and_costs.sql
-- Purpose: Move scheduling from date-only to real time slots and add the data
--          needed for downtime/uptime and cost analytics.
--
-- Changes:
--   * `maintenance_schedules.duration_minutes` turns a point-in-time booking
--     into an interval so slots can be laid out on a day/week grid and checked
--     for technician/room conflicts.
--   * `maintenance_schedules.technician_user_id` links a booking to a real
--     account so workload can be attributed instead of relying on a free-text
--     name. The legacy `technician` string is kept and backfilled.
--   * `downtime_windows` records planned or actual service windows that
--     departments coordinate around; these drive the downtime/uptime figures.
--   * Cost columns: estimated budget per schedule, actual labour/parts cost per
--     service record, and downtime minutes for uptime maths.
--
-- All statements are idempotent so this can be re-applied safely.

-- ---------------------------------------------------------------------------
-- Time slots on schedules
-- ---------------------------------------------------------------------------

ALTER TABLE maintenance_schedules
  ADD COLUMN IF NOT EXISTS duration_minutes INTEGER NOT NULL DEFAULT 60;

ALTER TABLE maintenance_schedules
  DROP CONSTRAINT IF EXISTS maintenance_schedules_duration_minutes_check;

ALTER TABLE maintenance_schedules
  ADD CONSTRAINT maintenance_schedules_duration_minutes_check
  CHECK (duration_minutes > 0 AND duration_minutes <= 1440);

ALTER TABLE maintenance_schedules
  ADD COLUMN IF NOT EXISTS technician_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;

-- Same slot semantics for generated recurrence occurrences.
ALTER TABLE maintenance_recurrences
  ADD COLUMN IF NOT EXISTS duration_minutes INTEGER NOT NULL DEFAULT 60;

ALTER TABLE maintenance_recurrences
  ADD COLUMN IF NOT EXISTS technician_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_maintenance_scheduled_at ON maintenance_schedules(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_maintenance_technician_user ON maintenance_schedules(technician_user_id)
  WHERE technician_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_recurrences_scheduled_at ON maintenance_recurrences(scheduled_at);

-- Best-effort attribution: match the free-text technician name to a user
-- account so historical work still shows up in workload reporting.
UPDATE maintenance_schedules s
   SET technician_user_id = u.id
  FROM users u
 WHERE s.technician_user_id IS NULL
   AND s.technician IS NOT NULL
   AND lower(u.username) = lower(btrim(s.technician));

UPDATE maintenance_schedules s
   SET technician_user_id = u.id
  FROM users u
 WHERE s.technician_user_id IS NULL
   AND s.technician IS NOT NULL
   AND u.email = lower(btrim(s.technician));

-- ---------------------------------------------------------------------------
-- Planned / actual downtime windows
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS downtime_windows (
  id SERIAL PRIMARY KEY,
  department VARCHAR(255),
  room VARCHAR(255),
  asset_id INTEGER REFERENCES assets(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  reason TEXT,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  window_type VARCHAR(20) NOT NULL DEFAULT 'planned'
    CHECK (window_type IN ('planned', 'unplanned', 'maintenance')),
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT downtime_windows_order CHECK (ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS idx_downtime_department ON downtime_windows(department);
CREATE INDEX IF NOT EXISTS idx_downtime_range ON downtime_windows(starts_at, ends_at);
CREATE INDEX IF NOT EXISTS idx_downtime_asset ON downtime_windows(asset_id)
  WHERE asset_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Cost tracking
-- ---------------------------------------------------------------------------

-- Budgeted cost for a planned job.
ALTER TABLE maintenance_schedules
  ADD COLUMN IF NOT EXISTS estimated_cost NUMERIC(14, 2)
  CHECK (estimated_cost IS NULL OR estimated_cost >= 0);

-- Actual spend once the job is done. `total_cost` is derived so reports can
-- never disagree with the components.
ALTER TABLE service_records
  ADD COLUMN IF NOT EXISTS labor_cost NUMERIC(14, 2)
  CHECK (labor_cost IS NULL OR labor_cost >= 0);
ALTER TABLE service_records
  ADD COLUMN IF NOT EXISTS parts_cost NUMERIC(14, 2)
  CHECK (parts_cost IS NULL OR parts_cost >= 0);
ALTER TABLE service_records
  ADD COLUMN IF NOT EXISTS downtime_minutes INTEGER
  CHECK (downtime_minutes IS NULL OR downtime_minutes >= 0);
ALTER TABLE service_records
  ADD COLUMN IF NOT EXISTS asset_id INTEGER REFERENCES assets(id) ON DELETE SET NULL;

ALTER TABLE service_records
  DROP COLUMN IF EXISTS total_cost;

ALTER TABLE service_records
  ADD COLUMN total_cost NUMERIC(14, 2)
  GENERATED ALWAYS AS (COALESCE(labor_cost, 0) + COALESCE(parts_cost, 0)) STORED;

CREATE INDEX IF NOT EXISTS idx_service_asset_id ON service_records(asset_id)
  WHERE asset_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_service_total_cost ON service_records(total_cost)
  WHERE total_cost > 0;

UPDATE service_records sr
   SET asset_id = s.asset_id
  FROM maintenance_schedules s
 WHERE sr.asset_id IS NULL
   AND sr.schedule_id IS NOT NULL
   AND s.asset_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_downtime_windows_updated_at ON downtime_windows;
CREATE TRIGGER trg_downtime_windows_updated_at
  BEFORE UPDATE ON downtime_windows
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
