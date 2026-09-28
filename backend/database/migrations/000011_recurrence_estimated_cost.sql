-- Cost and duration on recurring occurrences.
--
-- Migration 000009 added `estimated_cost` and `duration_minutes` to
-- maintenance_schedules, and duration_minutes was added to
-- maintenance_recurrences, but estimated_cost was not. `generateRecurrences`
-- copies the parent schedule's estimated cost onto every occurrence it creates,
-- so any recurring job with a budget failed with
-- "column estimated_cost of relation maintenance_recurrences does not exist".
--
-- That left recurring maintenance unusable whenever a cost was recorded, and
-- cost reporting silently excluded every recurring job.

ALTER TABLE maintenance_recurrences
  ADD COLUMN IF NOT EXISTS estimated_cost NUMERIC(14, 2)
  CHECK (estimated_cost IS NULL OR estimated_cost >= 0);

-- Recurring work is scheduled time, so it is filtered on alongside the parent.
CREATE INDEX IF NOT EXISTS idx_recurrences_estimated_cost
  ON maintenance_recurrences(estimated_cost)
  WHERE estimated_cost IS NOT NULL;
