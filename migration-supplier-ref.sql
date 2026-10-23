-- migration-supplier-ref.sql
--
-- Supplier-reference delivery — the small second line in the BUY-IN
-- COST cell.
-- SCHEMA CHANGE: adds one column.
--
-- quote_line_items.supplier_ref holds the model code, part number or
-- supplier URL the buy-in cost came from, e.g. "Vigor 3912" or
-- "https://supplier.example/p/12345".
--
-- NULL on every existing row, and NO BACKFILL IS PERFORMED. Every
-- quote already in the account simply shows the new box empty, ready
-- to type into. Nothing is guessed from existing descriptions: a
-- wrong supplier reference is worse than a blank one.
--
-- INTERNAL ONLY. The column is read by the workspace and by nothing
-- else — not the quote PDF, the Word export, the branded proposal,
-- the contract, or the Xero plan. No client-facing document changes
-- because a row carries a value.
--
-- 500 characters: long enough for a real supplier URL with query
-- parameters, short enough that the column cannot become a second
-- description.
--
-- IDEMPOTENT (IF NOT EXISTS). Run BEFORE the code deploy: the new
-- code selects this column on every quote open.

ALTER TABLE quote_line_items
  ADD COLUMN IF NOT EXISTS supplier_ref varchar(500);

-- Verification (read-only): expect one row —
--   supplier_ref | character varying | 500 | YES
SELECT column_name, data_type, character_maximum_length, is_nullable
FROM information_schema.columns
WHERE table_name = 'quote_line_items' AND column_name = 'supplier_ref';
