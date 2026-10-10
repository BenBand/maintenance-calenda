-- 000018_incident_asset_type_free_text.sql
-- Purpose: Let a reporter name an asset type the fixed list does not cover.
--
-- The incident form offers an "Other (specify)" choice on the asset type, which
-- writes the user's own text into incidents.asset_type. The original CHECK
-- constraint only allowed the four scheduled types, so that value was rejected
-- by the database before it could be stored.
--
-- Dropping the constraint leaves the column a plain VARCHAR(100). The validator
-- still bounds the length, and the dropdown keeps the four common types as the
-- one-tap options.

ALTER TABLE incidents DROP CONSTRAINT IF EXISTS incidents_asset_type_check;
