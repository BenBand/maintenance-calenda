-- Maintenance Calendar Database Schema
-- Lusaka City Council - IT Department

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(100) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(50) DEFAULT 'user' CHECK (role IN ('admin', 'manager', 'developer', 'user')),
  refresh_token VARCHAR(500),
  refresh_token_expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS maintenance_schedules (
  id SERIAL PRIMARY KEY,
  date DATE NOT NULL,
  department VARCHAR(255) NOT NULL,
  room VARCHAR(255) NOT NULL,
  asset_type VARCHAR(100) NOT NULL CHECK (asset_type IN ('laptop', 'desktop', 'network_equipment', 'printer')),
  asset_identifier VARCHAR(255),
  description TEXT,
  technician VARCHAR(255) NOT NULL,
  priority VARCHAR(20) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  reminder_days INTEGER DEFAULT 1,
  status VARCHAR(30) DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'in_progress', 'completed', 'cancelled', 'overdue')),
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS service_records (
  id SERIAL PRIMARY KEY,
  schedule_id INTEGER REFERENCES maintenance_schedules(id) ON DELETE CASCADE,
  work_performed TEXT NOT NULL,
  outcome TEXT,
  follow_up TEXT,
  signer_name VARCHAR(255),
  signer_date DATE,
  signature_data TEXT,
  signed_by VARCHAR(255),
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS service_signatures (
  id SERIAL PRIMARY KEY,
  service_record_id INTEGER NOT NULL REFERENCES service_records(id) ON DELETE CASCADE,
  signer_name VARCHAR(255) NOT NULL,
  signer_date DATE NOT NULL,
  signature_data BYTEA NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS incidents (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  department VARCHAR(255),
  room VARCHAR(255),
  asset_type VARCHAR(100) CHECK (asset_type IN ('laptop', 'desktop', 'network_equipment', 'printer')),
  asset_identifier VARCHAR(255),
  priority VARCHAR(20) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  status VARCHAR(30) DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  reported_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

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

CREATE TABLE IF NOT EXISTS incident_comments (
  id SERIAL PRIMARY KEY,
  incident_id INTEGER NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  commented_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  comment TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(255) NOT NULL,
  entity_type VARCHAR(100) NOT NULL,
  entity_id INTEGER,
  details JSONB,
  ip_address VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS assets (
  id SERIAL PRIMARY KEY,
  asset_tag VARCHAR(100) UNIQUE NOT NULL,
  asset_type VARCHAR(100) NOT NULL CHECK (asset_type IN ('laptop', 'desktop', 'network_equipment', 'printer')),
  manufacturer VARCHAR(255),
  model VARCHAR(255),
  serial_number VARCHAR(255),
  department VARCHAR(255),
  room VARCHAR(255),
  assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL,
  status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'maintenance', 'retired', 'lost')),
  purchase_date DATE,
  warranty_expiry DATE,
  notes TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS asset_lifecycle (
  id SERIAL PRIMARY KEY,
  asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  event_type VARCHAR(50) NOT NULL CHECK (event_type IN ('procured', 'assigned', 'maintained', 'transferred', 'retired', 'lost')),
  event_date DATE NOT NULL,
  details JSONB,
  performed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS downtime_records (
  id SERIAL PRIMARY KEY,
  asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  start_time TIMESTAMP NOT NULL,
  end_time TIMESTAMP,
  cause TEXT,
  resolution TEXT,
  reported_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS maintenance_costs (
  id SERIAL PRIMARY KEY,
  schedule_id INTEGER REFERENCES maintenance_schedules(id) ON DELETE SET NULL,
  asset_id INTEGER REFERENCES assets(id) ON DELETE SET NULL,
  cost_type VARCHAR(50) NOT NULL CHECK (cost_type IN ('parts', 'labor', 'external', 'other')),
  amount NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
  currency VARCHAR(3) DEFAULT 'ZMW',
  description TEXT,
  invoice_number VARCHAR(100),
  invoice_date DATE,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Recurring schedules support
ALTER TABLE maintenance_schedules
  ADD COLUMN IF NOT EXISTS is_recurring BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS recurrence_pattern VARCHAR(50) CHECK (recurrence_pattern IN ('daily', 'weekly', 'monthly', 'quarterly', 'annually')),
  ADD COLUMN IF NOT EXISTS recurrence_end_date DATE,
  ADD COLUMN IF NOT EXISTS parent_schedule_id INTEGER REFERENCES maintenance_schedules(id) ON DELETE SET NULL;

-- Time slots for scheduling
ALTER TABLE maintenance_schedules
  ADD COLUMN IF NOT EXISTS time_slot_start TIME,
  ADD COLUMN IF NOT EXISTS time_slot_end TIME;

-- Signed by user FK
ALTER TABLE service_records
  ADD COLUMN IF NOT EXISTS signed_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_maintenance_date ON maintenance_schedules(date);
CREATE INDEX IF NOT EXISTS idx_maintenance_department ON maintenance_schedules(department);
CREATE INDEX IF NOT EXISTS idx_maintenance_asset_type ON maintenance_schedules(asset_type);
CREATE INDEX IF NOT EXISTS idx_maintenance_status ON maintenance_schedules(status);
CREATE INDEX IF NOT EXISTS idx_maintenance_technician ON maintenance_schedules(technician);
CREATE INDEX IF NOT EXISTS idx_maintenance_created_at ON maintenance_schedules(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_maintenance_recurring ON maintenance_schedules(is_recurring) WHERE is_recurring = TRUE;
CREATE INDEX IF NOT EXISTS idx_maintenance_parent ON maintenance_schedules(parent_schedule_id);

CREATE INDEX IF NOT EXISTS idx_service_schedule ON service_records(schedule_id);
CREATE INDEX IF NOT EXISTS idx_service_created_at ON service_records(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_service_signed_by ON service_records(signed_by_user_id);

CREATE INDEX IF NOT EXISTS idx_signature_record ON service_signatures(service_record_id);

CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status);
CREATE INDEX IF NOT EXISTS idx_incidents_priority ON incidents(priority);
CREATE INDEX IF NOT EXISTS idx_incidents_department ON incidents(department);
CREATE INDEX IF NOT EXISTS idx_incidents_created_at ON incidents(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_incidents_reported_by ON incidents(reported_by);

CREATE INDEX IF NOT EXISTS idx_incident_ratings_incident ON incident_ratings(incident_id);
CREATE INDEX IF NOT EXISTS idx_incident_ratings_rated_by ON incident_ratings(rated_by);

CREATE INDEX IF NOT EXISTS idx_incident_comments_incident ON incident_comments(incident_id);
CREATE INDEX IF NOT EXISTS idx_incident_comments_commented_by ON incident_comments(commented_by);
CREATE INDEX IF NOT EXISTS idx_incident_comments_created_at ON incident_comments(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity_type, entity_id);

CREATE INDEX IF NOT EXISTS idx_assets_tag ON assets(asset_tag);
CREATE INDEX IF NOT EXISTS idx_assets_type ON assets(asset_type);
CREATE INDEX IF NOT EXISTS idx_assets_department ON assets(department);
CREATE INDEX IF NOT EXISTS idx_assets_status ON assets(status);
CREATE INDEX IF NOT EXISTS idx_assets_assigned ON assets(assigned_to);

CREATE INDEX IF NOT EXISTS idx_lifecycle_asset ON asset_lifecycle(asset_id);
CREATE INDEX IF NOT EXISTS idx_lifecycle_date ON asset_lifecycle(event_date);

CREATE INDEX IF NOT EXISTS idx_downtime_asset ON downtime_records(asset_id);
CREATE INDEX IF NOT EXISTS idx_downtime_start ON downtime_records(start_time);

CREATE INDEX IF NOT EXISTS idx_costs_schedule ON maintenance_costs(schedule_id);
CREATE INDEX IF NOT EXISTS idx_costs_asset ON maintenance_costs(asset_id);

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

-- Triggers for updated_at
DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_maintenance_updated_at ON maintenance_schedules;
CREATE TRIGGER trg_maintenance_updated_at
  BEFORE UPDATE ON maintenance_schedules
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_service_updated_at ON service_records;
CREATE TRIGGER trg_service_updated_at
  BEFORE UPDATE ON service_records
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_incidents_updated_at ON incidents;
CREATE TRIGGER trg_incidents_updated_at
  BEFORE UPDATE ON incidents
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_incident_ratings_updated_at ON incident_ratings;
CREATE TRIGGER trg_incident_ratings_updated_at
  BEFORE UPDATE ON incident_ratings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_incident_comments_updated_at ON incident_comments;
CREATE TRIGGER trg_incident_comments_updated_at
  BEFORE UPDATE ON incident_comments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_assets_updated_at ON assets;
CREATE TRIGGER trg_assets_updated_at
  BEFORE UPDATE ON assets
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_downtime_updated_at ON downtime_records;
CREATE TRIGGER trg_downtime_updated_at
  BEFORE UPDATE ON downtime_records
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Function for updated_at (idempotent)
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END $$;