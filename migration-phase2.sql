-- Phase 2 — add proposal_template_v2 column to quotes
--
-- Run via Render shell:
--   echo go; psql $DATABASE_URL -f migration-phase2.sql
--
-- Or paste the inline statement directly into psql.
--
-- Idempotent — uses ADD COLUMN IF NOT EXISTS. Safe to re-run.

ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS proposal_template_v2 VARCHAR(64);

-- Verify the column landed:
--   \d quotes
-- You should see proposal_template_v2 in the column list (VARCHAR(64),
-- nullable). No default, no constraint — null means "use sector default".
