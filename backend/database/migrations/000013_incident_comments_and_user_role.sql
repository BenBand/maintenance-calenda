-- 000013_incident_comments_and_user_role.sql
-- Purpose: Add incident comments table and add 'user' role to the CHECK constraint
--
-- Changes:
--   * `incident_comments` lets users discuss incidents with threaded comments.
--   * The users.role CHECK constraint is widened to include 'user' role.
--
-- All statements are idempotent so this can be re-applied safely.

-- ---------------------------------------------------------------------------
-- Role constraint: add 'user' role
-- ---------------------------------------------------------------------------

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('admin', 'manager', 'developer', 'user'));

-- ---------------------------------------------------------------------------
-- Incident comments
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS incident_comments (
  id SERIAL PRIMARY KEY,
  incident_id INTEGER NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  commented_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  comment TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_incident_comments_incident ON incident_comments(incident_id);
CREATE INDEX IF NOT EXISTS idx_incident_comments_commented_by ON incident_comments(commented_by);
CREATE INDEX IF NOT EXISTS idx_incident_comments_created_at ON incident_comments(created_at DESC);

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS trg_incident_comments_updated_at ON incident_comments;
CREATE TRIGGER trg_incident_comments_updated_at
  BEFORE UPDATE ON incident_comments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();