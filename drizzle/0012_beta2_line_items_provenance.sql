-- Migration: Beta-2 line-item provenance groundwork
--
-- Adds seven new columns to quote_line_items to support the Beta-2
-- provenance chips (Catalog / Client-specific / Estimated / Voice /
-- Document), the split Optional checkbox, and evidence ↔ line-item
-- linking.
--
-- Nothing reads or writes these columns yet. Writers are added in
-- Beta-2 Chunk 2 (backend rewrite). Readers land in Beta-2 Chunk 3
-- (frontend chips).
--
-- Safe, additive, idempotent. Zero visible change to the app.
-- Run in Render shell:   psql $DATABASE_URL -f drizzle/0012_beta2_line_items_provenance.sql

-- ── Split item name (today the "name" and "description" live together
--    in the description column; Chunk 2 starts writing the name here) ──
ALTER TABLE quote_line_items
  ADD COLUMN IF NOT EXISTS item_name VARCHAR(255);

-- ── Passthrough flag — drives the blue "Client-specific" chip
--    (true when the engine echoed source evidence verbatim because it
--    couldn't be swapped for a catalog item) ──
ALTER TABLE quote_line_items
  ADD COLUMN IF NOT EXISTS is_passthrough BOOLEAN NOT NULL DEFAULT FALSE;

-- ── Evidence category — commodity bucket the engine assigned
--    (e.g. "firewall", "managed_server_support"); used by the QDS to
--    surface category-level decisions in Chunk 3 ──
ALTER TABLE quote_line_items
  ADD COLUMN IF NOT EXISTS evidence_category VARCHAR(100);

-- ── Substitutable flag — whether evidence_category is commodity
--    (substitutable = TRUE) or client-specific (substitutable = FALSE).
--    Nullable because the engine may not be able to decide. ──
ALTER TABLE quote_line_items
  ADD COLUMN IF NOT EXISTS is_substitutable BOOLEAN;

-- ── Estimated flag — drives the amber "Estimated" chip
--    (true when the AI had to estimate because no catalog match existed) ──
ALTER TABLE quote_line_items
  ADD COLUMN IF NOT EXISTS is_estimated BOOLEAN NOT NULL DEFAULT FALSE;

-- ── Optional flag — splits "optional" out of the pricing_type enum
--    so Monthly and Annual items can also be marked optional ──
ALTER TABLE quote_line_items
  ADD COLUMN IF NOT EXISTS is_optional BOOLEAN NOT NULL DEFAULT FALSE;

-- ── Source input IDs — array of quote_inputs.id values whose evidence
--    contributed to this row. Drives the voice/document chips and the
--    evidence ↔ line-item two-way highlighting. JSONB for easy indexed
--    queries later. ──
ALTER TABLE quote_line_items
  ADD COLUMN IF NOT EXISTS source_input_ids JSONB;
