-- Phase 4A — Cover Imagery removal (Delivery 21).
--
-- Drops the five cover_image_* columns from organizations. The AI
-- cover image pipeline (added in 0018_add_cover_imagery, Delivery 12)
-- was abandoned over Deliveries 12–16 — Gemini's pixel-prediction
-- architecture couldn't reliably produce premium abstract design
-- regardless of prompt or multimodal anchoring. The chainpoint that
-- triggered generation was retired in Delivery 17, and all three
-- live design templates (Modern D18, Structured D19, Bold D20) render
-- typography-led covers with no AI background image.
--
-- After this migration:
--   - server/services/coverImageGeneration.ts is deleted.
--   - drizzle/schema.ts and shared/schema.ts no longer declare the
--     columns.
--   - The legacy renderer fall-through in brandedProposalRenderer.ts
--     no longer reads or interpolates cover_image_url.
--
-- The Gemini API key on the Render host can be revoked separately —
-- nothing in the codebase calls Gemini after this delivery.
--
-- Idempotent via IF EXISTS — safe to re-run.

ALTER TABLE organizations
  DROP COLUMN IF EXISTS cover_image_url,
  DROP COLUMN IF EXISTS cover_image_status,
  DROP COLUMN IF EXISTS cover_image_error,
  DROP COLUMN IF EXISTS cover_image_prompt,
  DROP COLUMN IF EXISTS cover_image_generated_at;
