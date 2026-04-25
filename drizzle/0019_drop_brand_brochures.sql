-- Phase 4A — Brochure feature removal (Delivery 13).
--
-- Drops the brand_brochures column from organizations. The brochure-upload
-- feature is being retired entirely from the brand-evidence pipeline:
--
-- - Brand evidence is narrowing to logo + website only.
-- - The colour pipeline (D14) will be deterministic — logo-pixel sampling
--   plus website CSS extraction — and no longer needs PDF text input.
-- - The geometric-graphics generator (D15) reads only colours, not tone.
--
-- The R2-stored PDFs themselves are intentionally left in place. They are
-- harmless orphans, deletion adds risk, and there are very few of them in
-- production. The DB record is the only thing that needs to go to keep
-- the schema clean and prevent the dual-schema-drift trap.
--
-- Idempotent via IF EXISTS — safe to re-run.

ALTER TABLE organizations
  DROP COLUMN IF EXISTS brand_brochures;
