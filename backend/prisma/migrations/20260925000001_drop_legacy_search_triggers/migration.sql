-- Remove legacy tsvector triggers/functions that were created outside the
-- migration history. They reference the dropped "searchVector" columns and
-- break every INSERT/UPDATE on "Note" and "Todo". Fuzzy search uses pg_trgm.
DROP TRIGGER IF EXISTS note_search_vector_trigger ON "Note";
DROP TRIGGER IF EXISTS todo_search_vector_trigger ON "Todo";
DROP FUNCTION IF EXISTS update_note_search_vector();
DROP FUNCTION IF EXISTS update_todo_search_vector();
