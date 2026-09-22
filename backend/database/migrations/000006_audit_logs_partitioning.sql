-- 000006_audit_logs_partitioning.sql
-- Purpose: Convert `audit_logs` into a RANGE (by month) partitioned table so the
--          log can be retained long-term. Partition pruning keeps recent
--          queries fast and old partitions can be detached/archived cheaply.
--
-- Approach (safe for a live table):
--   1. Create a new partitioned parent table `audit_logs_new` with the same
--      columns plus a PRIMARY KEY (id) and a FK to users.
--   2. Create monthly RANGE partitions on `created_at` for the next 36 months
--      plus a catch-all default partition.
--   3. Copy data from the legacy `audit_logs` into the new table.
--   4. Drop the legacy table and rename the new one, preserving the
--      `audit_logs` name and its indexes/constraints.
--
-- The `id` sequence is shared so inserts keep working after the swap.

CREATE TABLE IF NOT EXISTS audit_logs_new (
  id SERIAL NOT NULL,
  user_id INTEGER,
  action VARCHAR(255) NOT NULL,
  entity_type VARCHAR(100) NOT NULL,
  entity_id INTEGER,
  details JSONB,
  ip_address VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

-- Monthly partitions: 3 years forward + default catch-all.
DO $$
DECLARE
  partition_date DATE;
  partition_name TEXT;
  start_of_month DATE;
  end_of_month DATE;
BEGIN
  FOR i IN 0..35 LOOP
    partition_date := DATE_TRUNC('month', CURRENT_DATE) + (i || ' month')::INTERVAL;
    partition_name := 'audit_logs_y' || TO_CHAR(partition_date, 'YYYY') || '_m' || TO_CHAR(partition_date, 'MM');
    start_of_month := partition_date;
    end_of_month := (partition_date + INTERVAL '1 month')::date;
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS %I PARTITION OF audit_logs_new FOR VALUES FROM (%L) TO (%L)',
      partition_name, start_of_month, end_of_month
    );
  END LOOP;

  -- Catch-all partition for anything outside the generated range.
  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS audit_logs_default PARTITION OF audit_logs_new DEFAULT'
  );
END $$;

-- Foreign key to users (nullable so legacy rows survive).
ALTER TABLE audit_logs_new
  ADD CONSTRAINT fk_audit_logs_new_user
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;

-- Copy data across. `created_at` is TIMESTAMP in the legacy table; cast to
-- TIMESTAMPTZ (assumed UTC) so partition routing works.
INSERT INTO audit_logs_new (id, user_id, action, entity_type, entity_id, details, ip_address, created_at)
SELECT id, user_id, action, entity_type, entity_id, details, ip_address,
       (created_at AT TIME ZONE 'UTC')::timestamptz
  FROM audit_logs;

-- Preserve the sequence ownership so SERIAL keeps working.
ALTER SEQUENCE IF EXISTS audit_logs_id_seq OWNED BY audit_logs_new.id;

-- Swap tables. Drop the legacy table only after the new one is populated.
DROP TABLE IF EXISTS audit_logs;
ALTER TABLE audit_logs_new RENAME TO audit_logs;

-- Recreate the application-facing indexes.
CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_user_id ON audit_logs(user_id);