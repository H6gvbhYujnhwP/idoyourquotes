-- migration-branded-slots.sql
--
-- Delivery 2.8 — saved branded-proposal workspace state.
-- SCHEMA CHANGE: adds one column.
--
-- quotes.branded_slots holds the chapters as the user last left them:
--   {"slots":[…], "orientation":"landscape",
--    "coverDate":"2026-08-22", "savedAt":"…"}
-- NULL = the quote has never been opened in the branded workspace, so
-- the workspace generates a fresh draft exactly as before. No backfill.
--
-- WHY: chapter edits and removals lived in browser memory only. A
-- refresh discarded them, and reopening the workspace re-ran draft
-- generation — re-spending AI credits and losing the user's wording.
--
-- IDEMPOTENT (IF NOT EXISTS). Run BEFORE the code deploy: the new code
-- selects this column.

ALTER TABLE quotes ADD COLUMN IF NOT EXISTS branded_slots json;

-- Verification (read-only): expect one row, data_type "json".
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'quotes' AND column_name = 'branded_slots';
