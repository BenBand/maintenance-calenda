-- 000015_remove_estimated_cost_from_recurrences.sql
-- Purpose: Remove estimated_cost from maintenance_recurrences table

-- ---------------------------------------------------------------------------
-- Remove estimated_cost from maintenance_recurrences
-- ---------------------------------------------------------------------------

ALTER TABLE maintenance_recurrences DROP COLUMN IF EXISTS estimated_cost;

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS trg_maintenance_recurrences_updated_at ON maintenance_recurrences;
CREATE TRIGGER trg_maintenance_recurrences_updated_at
  BEFORE UPDATE ON maintenance_recurrences
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();