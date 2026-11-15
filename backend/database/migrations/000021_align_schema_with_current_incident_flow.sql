-- 000021_align_schema_with_current_incident_flow.sql
-- Aligns incident/reporting tables with the current application behavior.
-- Idempotent: safe to run on databases that already applied earlier migrations.

-- Incidents: reporters may enter a free-text asset type ("Other"), so the
-- original fixed-enum check must not block inserts/updates.
ALTER TABLE incidents
  DROP CONSTRAINT IF EXISTS incidents_asset_type_check;

-- Incidents: fields used by ticketing, SLA, assignment, escalation, tracking,
-- and public confirmation/rating flows.
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS ticket_no VARCHAR(20);
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS category VARCHAR(100);
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS sub_category VARCHAR(100);
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS directorate VARCHAR(255);
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS section VARCHAR(255);
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS ward VARCHAR(100);
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS location_details TEXT;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS contact_phone VARCHAR(50);
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMP;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS acknowledged_at TIMESTAMP;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS acknowledged_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMP;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS closed_at TIMESTAMP;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS escalation_reason TEXT;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS escalated_to INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMP;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS sla_policy_id INTEGER;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS sla_response_due TIMESTAMP;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS sla_resolution_due TIMESTAMP;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS sla_breached BOOLEAN DEFAULT false;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS resolution_notes TEXT;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS kb_article_id INTEGER;

-- Ensure ticket numbers remain unique when present.
CREATE UNIQUE INDEX IF NOT EXISTS idx_incidents_ticket_no_unique ON incidents(ticket_no) WHERE ticket_no IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_incidents_ticket ON incidents(ticket_no);
CREATE INDEX IF NOT EXISTS idx_incidents_assigned ON incidents(assigned_to);
CREATE INDEX IF NOT EXISTS idx_incidents_category ON incidents(category);
CREATE INDEX IF NOT EXISTS idx_incidents_directorate ON incidents(directorate);
CREATE INDEX IF NOT EXISTS idx_incidents_sla_breached ON incidents(sla_breached);

-- Public rating/feedback: anonymous submissions are allowed and must record the
-- technician who handled the fix. Keep per-user uniqueness and enforce one
-- anonymous rating row per incident.
ALTER TABLE incident_ratings
  ADD COLUMN IF NOT EXISTS technician_name VARCHAR(255);

ALTER TABLE incident_ratings
  ALTER COLUMN rated_by DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_incident_ratings_incident_anonymous
  ON incident_ratings(incident_id)
  WHERE rated_by IS NULL;

CREATE INDEX IF NOT EXISTS idx_incident_ratings_incident ON incident_ratings(incident_id);
CREATE INDEX IF NOT EXISTS idx_incident_ratings_rated_by ON incident_ratings(rated_by);
