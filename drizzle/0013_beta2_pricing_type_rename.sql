-- Migration: Beta-2 pricing-type value rename (Chunk 2a)
--
-- Renames legacy pricing_type values on quote_line_items to the Beta-2
-- canonical vocabulary, and moves "optional" rows onto the new is_optional
-- flag that was added in migration 0012.
--
--   standard  → one_off
--   optional  → one_off + is_optional = TRUE
--
-- Readers (quote-totals calculator, simple-quote PDF) have been updated
-- in this same release to accept BOTH the legacy and the new values, so
-- any rows written by still-untouched paths (AI flow, user edits via
-- the old UI helper, catalog copies) continue to render correctly.
-- Chunk 2b finishes the writer migration and tightens the readers.
--
-- catalog_items.pricing_type is intentionally left alone — the Catalog
-- page redesign in Chunk 3 handles that.
--
-- Idempotent — each UPDATE no-ops if no matching rows exist; the
-- ALTER...SET DEFAULT is safe to re-run.
-- Run in Render shell:  psql $DATABASE_URL -f drizzle/0013_beta2_pricing_type_rename.sql

-- ── Move optional rows onto the new flag (must run BEFORE the standard
--    rename so we don't miss them). ──
UPDATE quote_line_items
   SET is_optional  = TRUE,
       pricing_type = 'one_off'
 WHERE pricing_type = 'optional';

-- ── Rename the remaining "standard" rows to the new canonical value. ──
UPDATE quote_line_items
   SET pricing_type = 'one_off'
 WHERE pricing_type = 'standard';

-- ── Shift the column default so any future insert that relies on the
--    DEFAULT also lands on the new value. ──
ALTER TABLE quote_line_items
  ALTER COLUMN pricing_type SET DEFAULT 'one_off';
