-- 000005_signature_blob_storage.sql
-- Purpose: Move signature images out of the JSON/text `signature_data` column
--          into a dedicated `BYTEA` column on a separate `service_signatures`
--          table. This keeps the hot path (service record reads) small and
--          allows the signature blob to be compressed/encoded/decoded centrally
--          in the backend.
--
-- The legacy `signature_data` TEXT column is retained and backfilled from the
-- new blob column on read so existing consumers (and the frontend) keep working.

CREATE TABLE IF NOT EXISTS service_signatures (
  id SERIAL PRIMARY KEY,
  service_record_id INTEGER NOT NULL REFERENCES service_records(id) ON DELETE CASCADE,
  signer_name VARCHAR(255),
  signer_date DATE,
  mime_type VARCHAR(100) DEFAULT 'image/png',
  encoding VARCHAR(50) DEFAULT 'base64',
  compressed BOOLEAN DEFAULT FALSE,
  signature_data BYTEA NOT NULL,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- updated_at trigger for the new table.
DROP TRIGGER IF EXISTS trg_service_signatures_updated_at ON service_signatures;
CREATE TRIGGER trg_service_signatures_updated_at
BEFORE UPDATE ON service_signatures
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_signatures_service_record ON service_signatures(service_record_id);
CREATE INDEX IF NOT EXISTS idx_signatures_created_at ON service_signatures(created_at DESC);