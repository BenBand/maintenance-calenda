-- 000012_ratings_and_role_developer.sql
-- Purpose: Add incident ratings/feedback and rename the 'staff' role to
--          'developer' so the system exposes exactly three roles:
--          admin, manager, developer.
--
-- Changes:
--   * `incident_ratings` lets an end user rate the IT team's fix for a
--     reported incident. One rating per user per incident.
--   * The legacy 'staff' role is renamed to 'developer'. Existing staff rows
--     are migrated, and the CHECK constraint is replaced so new rows can only
--     use the three final roles.
--
-- All statements are idempotent so this can be re-applied safely.

-- ---------------------------------------------------------------------------
-- Role rename: staff -> developer
-- ---------------------------------------------------------------------------

UPDATE users SET role = 'developer' WHERE role = 'staff';

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('admin', 'manager', 'developer'));

-- ---------------------------------------------------------------------------
-- Incident ratings
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS incident_ratings (
  id SERIAL PRIMARY KEY,
  incident_id INTEGER NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  rated_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  feedback TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (incident_id, rated_by)
);

CREATE INDEX IF NOT EXISTS idx_incident_ratings_incident ON incident_ratings(incident_id);
CREATE INDEX IF NOT EXISTS idx_incident_ratings_rated_by ON incident_ratings(rated_by);

-- One rating per user per incident is enforced by the UNIQUE constraint
-- above, so no deduplication query is required here.

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS trg_incident_ratings_updated_at ON incident_ratings;
CREATE TRIGGER trg_incident_ratings_updated_at
  BEFORE UPDATE ON incident_ratings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();