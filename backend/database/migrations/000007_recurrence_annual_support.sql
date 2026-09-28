-- 000007_recurrence_annual_support.sql
-- Purpose: Extend the recurring-schedule model to support annual recurrence
--          and a configurable interval multiplier.
--
-- Changes:
--   * Add `recurrence_interval INTEGER` (defaults to 1) to `maintenance_schedules`.
--   * Extend the `recurrence_rule` CHECK constraint to allow 'annual'.

ALTER TABLE maintenance_schedules
  ADD COLUMN IF NOT EXISTS recurrence_interval INTEGER DEFAULT 1;

ALTER TABLE maintenance_schedules
  ALTER COLUMN recurrence_interval SET DEFAULT 1;

ALTER TABLE maintenance_schedules
  DROP CONSTRAINT IF EXISTS maintenance_schedules_recurrence_rule_check;

ALTER TABLE maintenance_schedules
  ADD CONSTRAINT maintenance_schedules_recurrence_rule_check
  CHECK (recurrence_rule IS NULL OR recurrence_rule IN ('none', 'monthly', 'quarterly', 'annual'));

CREATE INDEX IF NOT EXISTS idx_maintenance_recurrence_interval ON maintenance_schedules(recurrence_interval);
