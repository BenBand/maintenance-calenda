-- 000004_signed_by_user_fk.sql
-- Purpose: Convert the legacy `signed_by` text column on service_records into a
--          proper foreign key to `users` while preserving a text display column
--          for backward compatibility.
--
-- Current shape: service_records has both `signer_name VARCHAR(255)` and
-- `signed_by VARCHAR(255)` (both hold the signer's name).
--
-- New shape:
--   * `signer_name`        - retained display column (text), populated from the
--                            legacy `signed_by` value when missing.
--   * `signed_by_user_id`  - new INTEGER FK -> users(id) ON DELETE SET NULL.
--   * legacy `signed_by`   - renamed to `signer_name_legacy` and kept for audit
--                            continuity; no longer used by the API layer.
--
-- Backfill is safe: we never lose data, and the FK is nullable so legacy rows
-- that do not map to a real user keep working.

ALTER TABLE service_records
  ADD COLUMN IF NOT EXISTS signed_by_user_id INTEGER;

-- Preserve the old text value under a legacy name so it is still auditable.
ALTER TABLE service_records
  RENAME COLUMN signed_by TO signer_name_legacy;

-- Make sure signer_name has a value for every row (backfill from legacy).
UPDATE service_records
   SET signer_name = signer_name_legacy
 WHERE signer_name IS NULL
   AND signer_name_legacy IS NOT NULL;

-- Attempt to map legacy signer names to real users (best effort, safe to skip).
UPDATE service_records sr
   SET signed_by_user_id = u.id
 FROM users u
 WHERE sr.signed_by_user_id IS NULL
   AND sr.signer_name IS NOT NULL
   AND u.username = sr.signer_name;

-- Add the FK constraint (nullable so legacy rows survive).
ALTER TABLE service_records
  ADD CONSTRAINT fk_service_records_signed_by_user
  FOREIGN KEY (signed_by_user_id) REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_service_signed_by_user ON service_records(signed_by_user_id);