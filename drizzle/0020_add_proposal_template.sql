-- Phase 4A Delivery 17 — Proposal design template + cover stat strip toggle.
--
-- Three columns added to support user-selectable proposal design templates
-- (Modern / Structured / Bold) and the optional cover stat strip.
--
-- Rationale:
--   - organizations.proposal_template — org-wide default design pick
--   - organizations.cover_stat_strip_enabled — show/hide the cover stat
--     strip (4-up: users covered / SLA / uptime / per-user-month)
--   - quotes.proposal_template — per-quote override; NULL means "use org
--     default" (set via BrandChoiceModal at PDF-generation time)
--
-- Kept as TEXT (not enum) so a fourth template can be added later without
-- an enum migration. Server-side validates against the known values.
--
-- Apply manually via psql on the Render shell — drizzle-kit push remains
-- broken for non-interactive enum-rename prompts:
--
--   echo go; psql $DATABASE_URL -f drizzle/0020_add_proposal_template.sql
--
-- Or run the three statements inline:

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS proposal_template TEXT NOT NULL DEFAULT 'modern';

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS cover_stat_strip_enabled BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS proposal_template TEXT;
