-- Phase 4A — Brand Extraction Pipeline (Delivery 2).
--
-- Adds seven columns to the organizations table that together hold the
-- AI-extracted brand tokens produced by the new background extraction
-- pipeline. Inputs are the existing logo + company_website + brand_brochures
-- (already present from migration 0016). The renderer will prefer these
-- extracted tokens over the older pixel-extracted brand_primary_color /
-- brand_secondary_color when both are present.
--
--   brand_extracted_primary_color    hex colour pulled from the full
--                                    evidence set (logo + site + brochures)
--   brand_extracted_secondary_color  same
--   brand_extracted_font_feel        one of "serif" / "sans" / "display" /
--                                    "mixed" — the typographic personality
--                                    detected
--   brand_extracted_tone             short paragraph describing the brand
--                                    voice, used as an AI prompt reference
--                                    when writing branded proposal prose
--   brand_extraction_status          one of "idle" / "pending" / "ready" /
--                                    "failed" — surfaced as a status pill
--                                    on the Proposal Branding settings tab
--   brand_extraction_error           human-readable reason for a failed run
--   brand_extracted_at               timestamp of last successful extraction
--                                    (used for cooldown gating)
--
-- Idempotent via IF NOT EXISTS — safe to re-run.

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS brand_extracted_primary_color VARCHAR(7);

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS brand_extracted_secondary_color VARCHAR(7);

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS brand_extracted_font_feel VARCHAR(20);

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS brand_extracted_tone TEXT;

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS brand_extraction_status VARCHAR(20) DEFAULT 'idle';

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS brand_extraction_error TEXT;

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS brand_extracted_at TIMESTAMP;
