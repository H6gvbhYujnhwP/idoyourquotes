-- Phase 4A — Delivery (Settings: Proposal Branding tab shell).
--
-- Adds two columns to the organizations table that together hold the
-- raw "brand evidence" a user provides so the AI can produce branded
-- Contract/Tender and Project/Migration proposals later on.
--
--   company_website    text URL — used as a style reference by the
--                      extraction pipeline (landing later).
--   brand_brochures    JSONB array of { key, url, filename, uploadedAt }
--                      holding up to 3 PDF brochures / flyers uploaded by
--                      the user. Enforced max-3 at the API layer.
--
-- Existing brand_primary_color / brand_secondary_color are left alone —
-- they're still populated by the logo-colour-extraction code. The Phase 4
-- full extraction pipeline will eventually rewrite them from these new
-- inputs combined.
--
-- Idempotent via IF NOT EXISTS — safe to re-run.

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS company_website VARCHAR(512);

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS brand_brochures JSONB DEFAULT '[]'::jsonb;
