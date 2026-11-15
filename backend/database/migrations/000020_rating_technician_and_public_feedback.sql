-- 000020_rating_technician_and_public_feedback.sql
-- Add technician attribution to incident ratings so feedback can track who
-- completed the fix. Ratings are submitted without user accounts (QR flow),
-- so rated_by becomes nullable and uniqueness is enforced per incident for
-- anonymous submissions while keeping per-user uniqueness when rated_by is set.

ALTER TABLE incident_ratings
  ADD COLUMN IF NOT EXISTS technician_name VARCHAR(255);

ALTER TABLE incident_ratings
  ALTER COLUMN rated_by DROP NOT NULL;

-- Existing per-user uniqueness remains meaningful; anonymous (NULL rated_by)
-- ratings are limited to one row per incident via a partial unique index.
CREATE UNIQUE INDEX IF NOT EXISTS idx_incident_ratings_incident_anonymous
  ON incident_ratings(incident_id)
  WHERE rated_by IS NULL;
