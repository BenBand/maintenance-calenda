-- 000008_asset_registry_and_lifecycle.sql
-- Purpose: Introduce a first-class asset registry so equipment can be tracked
--          from procurement through deployment, maintenance and disposal,
--          rather than existing only as a free-text `asset_identifier` on
--          maintenance schedules and incidents.
--
-- Changes:
--   * `asset_types` reference table replaces the hard-coded asset_type CHECK
--     constraints so new categories can be added without a migration.
--   * `assets` holds procurement data (purchase date, cost, warranty,
--     end-of-life), ownership, location and the current lifecycle stage.
--   * `asset_events` is the append-only lifecycle log (procurement,
--     deployment, maintenance, retirement, disposal, ...) and doubles as the
--     cost ledger for asset-related spend.
--   * `maintenance_schedules` and `incidents` gain a nullable `asset_id` FK so
--     work can be attached to a registry entry; the legacy text columns are
--     kept and backfilled so nothing is lost.
--
-- All statements are idempotent so this can be re-applied safely.

-- ---------------------------------------------------------------------------
-- Reference data
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS asset_types (
  code VARCHAR(100) PRIMARY KEY,
  label VARCHAR(255) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO asset_types (code, label, sort_order) VALUES
  ('laptop', 'Laptop', 10),
  ('desktop', 'Desktop', 20),
  ('network_equipment', 'Network Equipment', 30),
  ('printer', 'Printer', 40)
ON CONFLICT (code) DO UPDATE
  SET label = EXCLUDED.label,
      sort_order = EXCLUDED.sort_order;

-- The asset vocabulary now lives in `asset_types`, so the inline CHECK
-- constraints would only drift from it. Drop them and keep NOT NULL.
ALTER TABLE maintenance_schedules DROP CONSTRAINT IF EXISTS maintenance_schedules_asset_type_check;
ALTER TABLE maintenance_recurrences DROP CONSTRAINT IF EXISTS maintenance_recurrences_asset_type_check;
ALTER TABLE incidents DROP CONSTRAINT IF EXISTS incidents_asset_type_check;

-- ---------------------------------------------------------------------------
-- Asset registry
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS assets (
  id SERIAL PRIMARY KEY,
  asset_identifier VARCHAR(255) NOT NULL UNIQUE,
  asset_type VARCHAR(100) NOT NULL REFERENCES asset_types(code),
  make_model VARCHAR(255),
  serial_number VARCHAR(255),
  description TEXT,

  -- Ownership / location
  department VARCHAR(255),
  room VARCHAR(255),
  assigned_to VARCHAR(255),
  supplier VARCHAR(255),

  -- Procurement
  purchase_date DATE,
  purchase_cost NUMERIC(14, 2) CHECK (purchase_cost IS NULL OR purchase_cost >= 0),
  warranty_start DATE,
  warranty_expiry DATE,

  -- Lifecycle
  lifecycle_status VARCHAR(30) NOT NULL DEFAULT 'procurement'
    CHECK (lifecycle_status IN (
      'procurement', 'deployed', 'in_service', 'maintenance',
      'retired', 'disposed'
    )),
  deployed_date DATE,
  end_of_life_date DATE,
  disposal_date DATE,
  disposal_method VARCHAR(100),
  disposal_reference VARCHAR(255),

  notes TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT assets_warranty_order
    CHECK (warranty_start IS NULL OR warranty_expiry IS NULL OR warranty_expiry >= warranty_start),
  CONSTRAINT assets_disposal_consistency
    CHECK (lifecycle_status <> 'disposed' OR disposal_date IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_assets_type ON assets(asset_type);
CREATE INDEX IF NOT EXISTS idx_assets_department ON assets(department);
CREATE INDEX IF NOT EXISTS idx_assets_status ON assets(lifecycle_status);
CREATE INDEX IF NOT EXISTS idx_assets_warranty_expiry ON assets(warranty_expiry)
  WHERE warranty_expiry IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_assets_end_of_life ON assets(end_of_life_date)
  WHERE end_of_life_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_assets_serial ON assets(serial_number)
  WHERE serial_number IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Lifecycle event log
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS asset_events (
  id SERIAL PRIMARY KEY,
  asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  event_type VARCHAR(40) NOT NULL CHECK (event_type IN (
    'procurement', 'deployment', 'maintenance', 'repair', 'upgrade',
    'relocation', 'retirement', 'disposal', 'status_change', 'note'
  )),
  event_date DATE NOT NULL,
  description TEXT,
  cost NUMERIC(14, 2) CHECK (cost IS NULL OR cost >= 0),
  performed_by VARCHAR(255),
  from_status VARCHAR(30),
  to_status VARCHAR(30),
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_asset_events_asset ON asset_events(asset_id, event_date DESC);
CREATE INDEX IF NOT EXISTS idx_asset_events_type ON asset_events(event_type);
CREATE INDEX IF NOT EXISTS idx_asset_events_date ON asset_events(event_date DESC);

-- ---------------------------------------------------------------------------
-- Link schedules / incidents to the registry
-- ---------------------------------------------------------------------------

ALTER TABLE maintenance_schedules
  ADD COLUMN IF NOT EXISTS asset_id INTEGER REFERENCES assets(id) ON DELETE SET NULL;
ALTER TABLE maintenance_recurrences
  ADD COLUMN IF NOT EXISTS asset_id INTEGER REFERENCES assets(id) ON DELETE SET NULL;
ALTER TABLE incidents
  ADD COLUMN IF NOT EXISTS asset_id INTEGER REFERENCES assets(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_maintenance_asset_id ON maintenance_schedules(asset_id)
  WHERE asset_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_incidents_asset_id ON incidents(asset_id)
  WHERE asset_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Backfill: promote every distinct legacy asset_identifier into the registry.
-- Existing schedules predate the registry, so treat them as deployed equipment
-- owned by the department/room recorded on the schedule.
-- ---------------------------------------------------------------------------

INSERT INTO assets (asset_identifier, asset_type, department, room, lifecycle_status, notes)
SELECT DISTINCT ON (lower(s.asset_identifier))
  s.asset_identifier,
  s.asset_type,
  s.department,
  s.room,
  'in_service',
  'Auto-registered from maintenance history'
FROM maintenance_schedules s
WHERE s.asset_identifier IS NOT NULL
  AND btrim(s.asset_identifier) <> ''
  AND EXISTS (SELECT 1 FROM asset_types t WHERE t.code = s.asset_type)
ORDER BY lower(s.asset_identifier), s.scheduled_at DESC
ON CONFLICT (asset_identifier) DO NOTHING;

-- Same for incidents, which may reference equipment that has no schedules.
INSERT INTO assets (asset_identifier, asset_type, department, room, lifecycle_status, notes)
SELECT DISTINCT ON (lower(i.asset_identifier))
  i.asset_identifier,
  i.asset_type,
  i.department,
  i.room,
  'in_service',
  'Auto-registered from incident history'
FROM incidents i
WHERE i.asset_identifier IS NOT NULL
  AND btrim(i.asset_identifier) <> ''
  AND i.asset_type IS NOT NULL
  AND EXISTS (SELECT 1 FROM asset_types t WHERE t.code = i.asset_type)
  AND NOT EXISTS (SELECT 1 FROM assets a WHERE lower(a.asset_identifier) = lower(i.asset_identifier))
ORDER BY lower(i.asset_identifier), i.created_at DESC
ON CONFLICT (asset_identifier) DO NOTHING;

UPDATE maintenance_schedules s
   SET asset_id = a.id
  FROM assets a
 WHERE s.asset_id IS NULL
   AND s.asset_identifier IS NOT NULL
   AND btrim(s.asset_identifier) <> ''
   AND lower(a.asset_identifier) = lower(s.asset_identifier);

UPDATE maintenance_recurrences r
   SET asset_id = a.id
  FROM assets a
 WHERE r.asset_id IS NULL
   AND r.asset_identifier IS NOT NULL
   AND btrim(r.asset_identifier) <> ''
   AND lower(a.asset_identifier) = lower(r.asset_identifier);

UPDATE incidents i
   SET asset_id = a.id
  FROM assets a
 WHERE i.asset_id IS NULL
   AND i.asset_identifier IS NOT NULL
   AND btrim(i.asset_identifier) <> ''
   AND lower(a.asset_identifier) = lower(i.asset_identifier);

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_assets_updated_at ON assets;
CREATE TRIGGER trg_assets_updated_at
  BEFORE UPDATE ON assets
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
