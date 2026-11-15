-- Neon alignment for current incident/reporting/tracking/rating flow.
-- Safe to run multiple times (idempotent where possible).
-- Run this in your Neon/Postgres database.

BEGIN;

-- Ensure helper trigger function exists (used by updated_at triggers in this app).
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- incidents: core table/columns required by current controllers and UI
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS incidents (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE incidents ADD COLUMN IF NOT EXISTS ticket_no VARCHAR(20);
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS title VARCHAR(255);
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS department VARCHAR(255);
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS room VARCHAR(255);
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS asset_type VARCHAR(100);
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS asset_identifier VARCHAR(255);
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS priority VARCHAR(20) DEFAULT 'medium';
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS status VARCHAR(30) DEFAULT 'open';
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS reported_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
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
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- Backfill nulls/defaults for existing rows where safe.
UPDATE incidents SET priority = 'medium' WHERE priority IS NULL;
UPDATE incidents SET status = 'open' WHERE status IS NULL;
UPDATE incidents SET sla_breached = false WHERE sla_breached IS NULL;

-- Remove legacy constraints that conflict with current behavior.
ALTER TABLE incidents DROP CONSTRAINT IF EXISTS incidents_asset_type_check;
ALTER TABLE incidents DROP CONSTRAINT IF EXISTS incidents_priority_check;
ALTER TABLE incidents DROP CONSTRAINT IF EXISTS incidents_status_check;
ALTER TABLE incidents DROP CONSTRAINT IF EXISTS incidents_category_check;

-- Re-apply constraints aligned with current app values.
ALTER TABLE incidents
  ADD CONSTRAINT incidents_priority_check
  CHECK (priority IN ('low', 'medium', 'high', 'critical'));
ALTER TABLE incidents
  ADD CONSTRAINT incidents_status_check
  CHECK (status IN ('open', 'in_progress', 'resolved', 'closed'));

-- ticket_no must be unique when present (trigger generates it on insert).
CREATE UNIQUE INDEX IF NOT EXISTS idx_incidents_ticket_no_unique ON incidents(ticket_no) WHERE ticket_no IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status);
CREATE INDEX IF NOT EXISTS idx_incidents_priority ON incidents(priority);
CREATE INDEX IF NOT EXISTS idx_incidents_department ON incidents(department);
CREATE INDEX IF NOT EXISTS idx_incidents_created_at ON incidents(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_incidents_reported_by ON incidents(reported_by);
CREATE INDEX IF NOT EXISTS idx_incidents_ticket ON incidents(ticket_no);
CREATE INDEX IF NOT EXISTS idx_incidents_assigned ON incidents(assigned_to);
CREATE INDEX IF NOT EXISTS idx_incidents_category ON incidents(category);
CREATE INDEX IF NOT EXISTS idx_incidents_directorate ON incidents(directorate);
CREATE INDEX IF NOT EXISTS idx_incidents_sla_breached ON incidents(sla_breached);

-- ---------------------------------------------------------------------------
-- SLA policies (used by incident creation/status views)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sla_policies (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  priority VARCHAR(20) NOT NULL CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  category VARCHAR(100),
  response_time_minutes INTEGER NOT NULL,
  resolution_time_minutes INTEGER NOT NULL,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Seed defaults only if table is empty.
INSERT INTO sla_policies (name, priority, category, response_time_minutes, resolution_time_minutes)
SELECT v.name, v.priority, v.category, v.response_time_minutes, v.resolution_time_minutes
FROM (VALUES
  ('Critical - Network Outage', 'critical', 'network', 30, 240),
  ('Critical - System Down', 'critical', NULL, 30, 240),
  ('High - Hardware Failure', 'high', 'hardware', 60, 480),
  ('High Priority', 'high', NULL, 60, 480),
  ('Medium Priority', 'medium', NULL, 120, 1440),
  ('Low Priority', 'low', NULL, 240, 2880)
) AS v(name, priority, category, response_time_minutes, resolution_time_minutes)
WHERE NOT EXISTS (SELECT 1 FROM sla_policies);

-- Link incidents.sla_policy_id to sla_policies when possible.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'incidents_sla_policy_id_fkey'
  ) THEN
    ALTER TABLE incidents
      ADD CONSTRAINT incidents_sla_policy_id_fkey
      FOREIGN KEY (sla_policy_id) REFERENCES sla_policies(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- incident_ratings: required for rating/feedback and public stats
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS incident_ratings (
  id SERIAL PRIMARY KEY,
  incident_id INTEGER NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  rated_by INTEGER REFERENCES users(id) ON DELETE CASCADE,
  technician_name VARCHAR(255),
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  feedback TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE incident_ratings ADD COLUMN IF NOT EXISTS technician_name VARCHAR(255);
ALTER TABLE incident_ratings ADD COLUMN IF NOT EXISTS feedback TEXT;
ALTER TABLE incident_ratings ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE incident_ratings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE incident_ratings ALTER COLUMN rated_by DROP NOT NULL;

-- Ensure per-user uniqueness and single anonymous rating per incident.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'incident_ratings_incident_id_rated_by_key'
  ) THEN
    -- may fail if duplicates exist; left to operator in that rare case
    BEGIN
      ALTER TABLE incident_ratings
        ADD CONSTRAINT incident_ratings_incident_id_rated_by_key UNIQUE (incident_id, rated_by);
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'Could not add (incident_id, rated_by) unique constraint: %', SQLERRM;
    END;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_incident_ratings_incident_anonymous
  ON incident_ratings(incident_id)
  WHERE rated_by IS NULL;
CREATE INDEX IF NOT EXISTS idx_incident_ratings_incident ON incident_ratings(incident_id);
CREATE INDEX IF NOT EXISTS idx_incident_ratings_rated_by ON incident_ratings(rated_by);

-- ---------------------------------------------------------------------------
-- Ticket number generation trigger (needed for public tracking by ticket)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION generate_incident_ticket_no()
RETURNS TRIGGER AS $$
DECLARE
  year_part VARCHAR(4);
  seq_num INTEGER;
BEGIN
  IF NEW.ticket_no IS NULL OR btrim(NEW.ticket_no) = '' THEN
    year_part := EXTRACT(YEAR FROM CURRENT_DATE)::VARCHAR;
    SELECT COALESCE(MAX(CAST(SUBSTRING(ticket_no FROM 13) AS INTEGER)), 0) + 1
    INTO seq_num
    FROM incidents
    WHERE ticket_no LIKE 'LCC-INC-' || year_part || '-%';
    NEW.ticket_no := 'LCC-INC-' || year_part || '-' || LPAD(seq_num::VARCHAR, 4, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_generate_incident_ticket ON incidents;
CREATE TRIGGER trg_generate_incident_ticket
  BEFORE INSERT ON incidents
  FOR EACH ROW EXECUTE FUNCTION generate_incident_ticket_no();

DROP TRIGGER IF EXISTS trg_incidents_updated_at ON incidents;
CREATE TRIGGER trg_incidents_updated_at
  BEFORE UPDATE ON incidents
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_incident_ratings_updated_at ON incident_ratings;
CREATE TRIGGER trg_incident_ratings_updated_at
  BEFORE UPDATE ON incident_ratings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMIT;
