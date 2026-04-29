-- Migration: add brochure columns to organizations.
-- Phase 4B Delivery A — Branded Proposal with Brochure (Tile 3) foundation.
--
-- Run on the Render shell with:
--   echo go; psql $DATABASE_URL -f drizzle/migrations/0099_add_brochure_columns.sql
--
-- Or paste the body directly into psql interactive mode.
-- All columns are NULLable so existing orgs are unaffected — they simply
-- have no brochure attached until the user uploads one.

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS brochure_file_url      TEXT,
  ADD COLUMN IF NOT EXISTS brochure_file_key      TEXT,
  ADD COLUMN IF NOT EXISTS brochure_filename      TEXT,
  ADD COLUMN IF NOT EXISTS brochure_file_size     INTEGER,
  ADD COLUMN IF NOT EXISTS brochure_page_count    INTEGER,
  ADD COLUMN IF NOT EXISTS brochure_hash          VARCHAR(64),
  ADD COLUMN IF NOT EXISTS brochure_extracted_at  TIMESTAMP,
  ADD COLUMN IF NOT EXISTS brochure_deleted_at    TIMESTAMP,
  ADD COLUMN IF NOT EXISTS brochure_knowledge     JSONB;

-- Helpful index for the soft-archive lookup (Settings page filters by it).
CREATE INDEX IF NOT EXISTS idx_organizations_brochure_active
  ON organizations (id)
  WHERE brochure_deleted_at IS NULL AND brochure_file_key IS NOT NULL;

-- Verification queries (uncomment to run after the ALTER TABLE):
-- \d organizations
-- SELECT column_name, data_type, is_nullable FROM information_schema.columns
--   WHERE table_name = 'organizations' AND column_name LIKE 'brochure%'
--   ORDER BY column_name;
