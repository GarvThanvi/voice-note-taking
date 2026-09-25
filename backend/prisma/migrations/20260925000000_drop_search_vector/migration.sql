-- Drop legacy full-text search objects that were created outside the migration
-- history (unused by the app; fuzzy search uses pg_trgm similarity instead).
DROP INDEX IF EXISTS "Note_searchVector_idx";
DROP INDEX IF EXISTS "Todo_searchVector_idx";
ALTER TABLE "Note" DROP COLUMN IF EXISTS "searchVector";
ALTER TABLE "Todo" DROP COLUMN IF EXISTS "searchVector";
