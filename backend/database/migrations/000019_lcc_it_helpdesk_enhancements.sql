-- 000019_lcc_it_helpdesk_enhancements.sql
-- Purpose: Lusaka City Council IT Helpdesk enhancements
--   - Ticket numbering system (LCC-INC-YYYY-####)
--   - SLA tracking (response/resolution times)
--   - Assignment and escalation
--   - Better categorization for IT service desk
--   - Location taxonomy (Directorate/Department/Section)
--   - Acknowledgement tracking
--   - Planned maintenance notices/communication
--   - Work order approvals
--   - Enhanced asset criticality

-- Ticket numbering for incidents
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS ticket_no VARCHAR(20) UNIQUE;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMP;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS acknowledged_at TIMESTAMP;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS acknowledged_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMP;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS closed_at TIMESTAMP;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS escalation_reason TEXT;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS escalated_to INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMP;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS contact_phone VARCHAR(50);
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS location_details TEXT;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS category VARCHAR(100) CHECK (category IN ('network', 'email', 'hardware', 'software', 'access', 'cctv', 'telephony', 'internet', 'server', 'printer', 'other'));
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS sub_category VARCHAR(100);
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS directorate VARCHAR(255);
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS section VARCHAR(255);
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS ward VARCHAR(100);

-- SLA tracking
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

-- Insert default LCC SLA policies (realistic for local government)
INSERT INTO sla_policies (name, priority, category, response_time_minutes, resolution_time_minutes) VALUES
('Critical - Network Outage', 'critical', 'network', 30, 240),
('Critical - System Down', 'critical', NULL, 30, 240),
('High - Hardware Failure', 'high', 'hardware', 60, 480),
('High Priority', 'high', NULL, 60, 480),
('Medium Priority', 'medium', NULL, 120, 1440),
('Low Priority', 'low', NULL, 240, 2880)
ON CONFLICT DO NOTHING;

ALTER TABLE incidents ADD COLUMN IF NOT EXISTS sla_policy_id INTEGER REFERENCES sla_policies(id);
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS sla_response_due TIMESTAMP;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS sla_resolution_due TIMESTAMP;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS sla_breached BOOLEAN DEFAULT false;

-- Planned maintenance notices for communication
CREATE TABLE IF NOT EXISTS maintenance_notices (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  notice_type VARCHAR(50) DEFAULT 'planned_outage' CHECK (notice_type IN ('planned_outage', 'emergency', 'general', 'advisory')),
  affected_directorates TEXT[],
  affected_departments TEXT[],
  start_time TIMESTAMP NOT NULL,
  end_time TIMESTAMP,
  published BOOLEAN DEFAULT false,
  published_at TIMESTAMP,
  published_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Work orders requiring approval
CREATE TABLE IF NOT EXISTS work_orders (
  id SERIAL PRIMARY KEY,
  work_order_no VARCHAR(30) UNIQUE,
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  department VARCHAR(255) NOT NULL,
  requested_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL,
  priority VARCHAR(20) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  status VARCHAR(30) DEFAULT 'proposed' CHECK (status IN ('proposed', 'approved', 'rejected', 'in_progress', 'completed', 'cancelled')),
  estimated_cost DECIMAL(12,2),
  estimated_duration_hours DECIMAL(6,2),
  approved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  approval_date TIMESTAMP,
  approval_notes TEXT,
  rejection_reason TEXT,
  scheduled_start TIMESTAMP,
  scheduled_end TIMESTAMP,
  maintenance_schedule_id INTEGER REFERENCES maintenance_schedules(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Enhanced assets
ALTER TABLE assets ADD COLUMN IF NOT EXISTS criticality VARCHAR(20) DEFAULT 'medium' CHECK (criticality IN ('low', 'medium', 'high', 'critical'));
ALTER TABLE assets ADD COLUMN IF NOT EXISTS cost_center VARCHAR(100);
ALTER TABLE assets ADD COLUMN IF NOT EXISTS life_expectancy_years INTEGER;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS warranty_vendor VARCHAR(255);
ALTER TABLE assets ADD COLUMN IF NOT EXISTS location_details TEXT;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS directorate VARCHAR(255);

-- Knowledge base enhancement - link resolutions to KB
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS resolution_notes TEXT;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS kb_article_id INTEGER;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_incidents_ticket ON incidents(ticket_no);
CREATE INDEX IF NOT EXISTS idx_incidents_assigned ON incidents(assigned_to);
CREATE INDEX IF NOT EXISTS idx_incidents_category ON incidents(category);
CREATE INDEX IF NOT EXISTS idx_incidents_directorate ON incidents(directorate);
CREATE INDEX IF NOT EXISTS idx_incidents_acknowledged ON incidents(acknowledged_at);
CREATE INDEX IF NOT EXISTS idx_incidents_sla_breached ON incidents(sla_breached);
CREATE INDEX IF NOT EXISTS idx_work_orders_status ON work_orders(status);
CREATE INDEX IF NOT EXISTS idx_work_orders_requested ON work_orders(requested_by);
CREATE INDEX IF NOT EXISTS idx_maintenance_notices_published ON maintenance_notices(published, start_time);
CREATE INDEX IF NOT EXISTS idx_assets_criticality ON assets(criticality);

-- Triggers
DROP TRIGGER IF EXISTS trg_sla_policies_updated_at ON sla_policies;
CREATE TRIGGER trg_sla_policies_updated_at
  BEFORE UPDATE ON sla_policies
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_maintenance_notices_updated_at ON maintenance_notices;
CREATE TRIGGER trg_maintenance_notices_updated_at
  BEFORE UPDATE ON maintenance_notices
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_work_orders_updated_at ON work_orders;
CREATE TRIGGER trg_work_orders_updated_at
  BEFORE UPDATE ON work_orders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Function to generate ticket numbers
CREATE OR REPLACE FUNCTION generate_incident_ticket_no()
RETURNS TRIGGER AS $$
DECLARE
  year_part VARCHAR(4);
  seq_num INTEGER;
BEGIN
  IF NEW.ticket_no IS NULL THEN
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

-- Function to generate work order numbers
CREATE OR REPLACE FUNCTION generate_work_order_no()
RETURNS TRIGGER AS $$
DECLARE
  year_part VARCHAR(4);
  seq_num INTEGER;
BEGIN
  IF NEW.work_order_no IS NULL THEN
    year_part := EXTRACT(YEAR FROM CURRENT_DATE)::VARCHAR;
    SELECT COALESCE(MAX(CAST(SUBSTRING(work_order_no FROM 13) AS INTEGER)), 0) + 1
    INTO seq_num
    FROM work_orders
    WHERE work_order_no LIKE 'LCC-WO-' || year_part || '-%';
    NEW.work_order_no := 'LCC-WO-' || year_part || '-' || LPAD(seq_num::VARCHAR, 4, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_generate_work_order ON work_orders;
CREATE TRIGGER trg_generate_work_order
  BEFORE INSERT ON work_orders
  FOR EACH ROW EXECUTE FUNCTION generate_work_order_no();
