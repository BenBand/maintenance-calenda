-- 000016_remove_asset_event_cost.sql
-- Purpose: Remove the last remaining cost column, asset_events.cost
--
-- Context:
--   * 000014 removed the cost columns on assets, service_records and
--     maintenance_schedules, and dropped the maintenance_costs table.
--   * 000015 removed estimated_cost from maintenance_recurrences.
--   * asset_events.cost was left behind as the final "cost ledger" column.
--     The lifecycle log now records what happened and when, not what it cost,
--     so the column goes too.
--
-- All statements are idempotent so this can be re-applied safely.

-- ---------------------------------------------------------------------------
-- Remove cost from the lifecycle event log
-- ---------------------------------------------------------------------------

ALTER TABLE asset_events DROP COLUMN IF EXISTS cost;
