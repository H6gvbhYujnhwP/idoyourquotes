-- migration-generated-documents.sql
--
-- Delivery 2.6b — stored documents. SCHEMA CHANGE: adds one column.
--
-- quotes.generated_documents holds the latest generated proposal and
-- contract PDF for that quote:
--   {"brandedProposal": {"key":"…","filename":"…","generatedAt":"…",
--                        "sizeBytes":123},
--    "contract":        {"key":"…", …, "tier":"gold"}}
-- NULL means nothing has been generated yet, which is the correct
-- starting state for every existing quote — no backfill needed.
--
-- Latest-only by design: a new render of the same kind replaces the
-- entry and its stored file is deleted, so this never grows per quote.
--
-- IDEMPOTENT (IF NOT EXISTS). Run BEFORE the code deploy: the new code
-- selects this column, so deploying first would error on every quote
-- read until the column exists.

ALTER TABLE quotes ADD COLUMN IF NOT EXISTS generated_documents json;

-- Verification (read-only): expect one row, data_type "json".
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'quotes' AND column_name = 'generated_documents';
