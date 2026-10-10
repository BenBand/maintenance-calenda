-- 000017_create_faq_table.sql
-- Purpose: Create the FAQ articles table for the user-facing help page.
-- The developer seeds the initial articles; users can only read them.
--
-- All statements are idempotent so this can be re-applied safely.

CREATE TABLE IF NOT EXISTS faq_articles (
  id SERIAL PRIMARY KEY,
  category VARCHAR(100),
  title VARCHAR(255) NOT NULL,
  body TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_faq_category ON faq_articles(category);
CREATE INDEX IF NOT EXISTS idx_faq_sort ON faq_articles(sort_order);

DROP TRIGGER IF EXISTS trg_faq_updated_at ON faq_articles;
CREATE TRIGGER trg_faq_updated_at
  BEFORE UPDATE ON faq_articles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();