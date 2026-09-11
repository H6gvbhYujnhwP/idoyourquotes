-- migration-description-newlines.sql
--
-- Delivery 2.5 (new-line bullets). DATA ONLY — no schema change.
--
-- Converts line-item and catalogue descriptions from the old separator
-- markers to the new format (see shared/lineItemDescription.ts):
--   "Summary || point || point"        ->  "Summary\npoint\npoint"
--   "Summary ## step ## step"          ->  "Summary\n1. step\n2. step"
-- The first line stays the summary; every further line prints as a
-- bullet (or keeps its number) on PDFs, proposals, contracts, Word and
-- Xero, and shows on its own line in the quote workspace and catalogue.
--
-- Every surface still understands the old markers, so this is a tidy-up
-- for consistency and editing, not something the documents depend on.
--
-- IDEMPOTENT: only rows still containing "##" or "||" are touched; a
-- second run changes 0 rows. One transaction — all or nothing.

BEGIN;

-- 1. Numbered steps ("##"), quote line items.
UPDATE quote_line_items q
SET description = s.nd
FROM (
  SELECT id,
         btrim(string_agg(CASE WHEN ord = 1 THEN btrim(part)
                               ELSE (rn - 1)::text || '. ' || btrim(part) END,
                          E'\n' ORDER BY ord), E'\n ') AS nd
  FROM (
    SELECT q2.id, t.part, t.ord,
           row_number() OVER (PARTITION BY q2.id ORDER BY t.ord) AS rn
    FROM quote_line_items q2,
         regexp_split_to_table(q2.description, '##') WITH ORDINALITY AS t(part, ord)
    WHERE q2.description LIKE '%##%'
      AND (t.ord = 1 OR btrim(t.part) <> '')
  ) x
  GROUP BY id
) s
WHERE q.id = s.id;

-- 2. Numbered steps ("##"), catalogue items.
UPDATE catalog_items c
SET description = s.nd
FROM (
  SELECT id,
         btrim(string_agg(CASE WHEN ord = 1 THEN btrim(part)
                               ELSE (rn - 1)::text || '. ' || btrim(part) END,
                          E'\n' ORDER BY ord), E'\n ') AS nd
  FROM (
    SELECT c2.id, t.part, t.ord,
           row_number() OVER (PARTITION BY c2.id ORDER BY t.ord) AS rn
    FROM catalog_items c2,
         regexp_split_to_table(c2.description, '##') WITH ORDINALITY AS t(part, ord)
    WHERE c2.description LIKE '%##%'
      AND (t.ord = 1 OR btrim(t.part) <> '')
  ) x
  GROUP BY id
) s
WHERE c.id = s.id;

-- 3. Bullets ("||"), both tables: each marker becomes a line break;
--    empty points are dropped.
UPDATE quote_line_items
SET description = btrim(regexp_replace(regexp_replace(description, '\s*\|\|\s*', E'\n', 'g'), E'\n{2,}', E'\n', 'g'), E'\n ')
WHERE description LIKE '%||%';

UPDATE catalog_items
SET description = btrim(regexp_replace(regexp_replace(description, '\s*\|\|\s*', E'\n', 'g'), E'\n{2,}', E'\n', 'g'), E'\n ')
WHERE description LIKE '%||%';

COMMIT;

-- Verification (read-only): both counts should be 0.
SELECT
  (SELECT COUNT(*) FROM quote_line_items WHERE description LIKE '%||%' OR description LIKE '%##%') AS quote_lines_left,
  (SELECT COUNT(*) FROM catalog_items   WHERE description LIKE '%||%' OR description LIKE '%##%') AS catalogue_items_left;
