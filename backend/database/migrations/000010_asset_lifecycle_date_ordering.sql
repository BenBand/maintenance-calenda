-- Lifecycle dates must run forwards in time.
--
-- Migration 000008 constrained the warranty window and required a disposal date
-- once an asset is disposed, but nothing stopped an asset bought in 2023 from
-- being recorded as reaching end of life in 2020 or being disposed of before it
-- was bought. The API rejects these combinations, and these constraints make
-- the rule hold even for direct SQL, imports, or a future code path that
-- forgets the check.
--
-- Existing rows are repaired first: any row that already violates the rule is
-- pulled back to a coherent value rather than blocking the migration.

UPDATE assets
   SET end_of_life_date = NULL
 WHERE purchase_date IS NOT NULL
   AND end_of_life_date IS NOT NULL
   AND end_of_life_date < purchase_date;

UPDATE assets
   SET disposal_date = NULL
 WHERE purchase_date IS NOT NULL
   AND disposal_date IS NOT NULL
   AND disposal_date < purchase_date;

-- An asset recorded as disposed must keep its disposal date, so a repaired row
-- is moved back to retired until the disposal is re-recorded properly.
UPDATE assets
   SET lifecycle_status = 'retired'
 WHERE lifecycle_status = 'disposed'
   AND disposal_date IS NULL;

ALTER TABLE assets
  DROP CONSTRAINT IF EXISTS assets_warranty_after_purchase;

ALTER TABLE assets
  ADD CONSTRAINT assets_warranty_after_purchase
  CHECK (purchase_date IS NULL OR warranty_start IS NULL OR warranty_start >= purchase_date);

ALTER TABLE assets
  DROP CONSTRAINT IF EXISTS assets_deployed_after_purchase;

ALTER TABLE assets
  ADD CONSTRAINT assets_deployed_after_purchase
  CHECK (purchase_date IS NULL OR deployed_date IS NULL OR deployed_date >= purchase_date);

ALTER TABLE assets
  DROP CONSTRAINT IF EXISTS assets_eol_after_purchase;

ALTER TABLE assets
  ADD CONSTRAINT assets_eol_after_purchase
  CHECK (purchase_date IS NULL OR end_of_life_date IS NULL OR end_of_life_date >= purchase_date);

ALTER TABLE assets
  DROP CONSTRAINT IF EXISTS assets_disposal_after_purchase;

ALTER TABLE assets
  ADD CONSTRAINT assets_disposal_after_purchase
  CHECK (purchase_date IS NULL OR disposal_date IS NULL OR disposal_date >= purchase_date);

ALTER TABLE assets
  DROP CONSTRAINT IF EXISTS assets_disposal_after_eol;

ALTER TABLE assets
  ADD CONSTRAINT assets_disposal_after_eol
  CHECK (end_of_life_date IS NULL OR disposal_date IS NULL OR disposal_date >= end_of_life_date);
