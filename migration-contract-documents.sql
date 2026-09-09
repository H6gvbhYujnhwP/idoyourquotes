-- migration-contract-documents.sql
--
-- Contract-button delivery, stage 1 — the storage your Gold and Silver
-- contract documents live in, plus the signatory identity the contract's
-- acceptance page needs.
--
-- WHY RAW SQL: drizzle-kit push is broken on this codebase. Schema
-- changes are applied by hand in the Render shell psql session BEFORE
-- the matching code is pushed.
--
-- SAFETY:
--   - One new table and three new nullable columns. Nothing existing is
--     altered, dropped or backfilled.
--   - IF NOT EXISTS throughout, so this is safe to re-run.
--   - No org has a contract document until one is seeded, and nothing in
--     the app reads this table until the Settings screen ships. Applying
--     this migration on its own is a zero-behaviour change.
--
-- HOW TO RUN (Render shell). Paste truncation eats the first characters
-- of a pasted line, so the `echo go;` prefix is load-bearing:
--
--   echo go; psql "$DATABASE_URL"
--
-- ...then paste the statements below at the psql prompt.

-- ── 1. Contract documents ───────────────────────────────────────────
-- One row per (organisation, package tier). Sweetbyte runs "gold" and
-- "silver" as two entirely separate documents.

CREATE TABLE IF NOT EXISTS contract_documents (
  id                  bigserial PRIMARY KEY,
  org_id              bigint       NOT NULL,
  tier                varchar(32)  NOT NULL,
  display_name        varchar(255) NOT NULL,
  clauses             json,
  acceptance_body     text,
  next_steps_body     text,
  thank_you_body      text,
  pricing_caveat_body text,
  is_active           boolean      NOT NULL DEFAULT true,
  created_at          timestamp    NOT NULL DEFAULT now(),
  updated_at          timestamp    NOT NULL DEFAULT now()
);

-- One document per tier per org. Makes the upsert on save a simple
-- ON CONFLICT rather than a read-then-branch, and stops a duplicate
-- "gold" row appearing if a save is double-submitted.
CREATE UNIQUE INDEX IF NOT EXISTS contract_documents_org_tier_idx
  ON contract_documents (org_id, tier);

-- ── 2. Signatory identity ───────────────────────────────────────────
-- Both live Sweetbyte contracts carry a signed provider block, which
-- until now was added outside the app. The contract cannot assemble
-- itself without these. All nullable: an org with no signature on file
-- still gets a contract, just with a blank line to sign by hand.
--
-- contract_signature_image holds an R2 object key, same convention as
-- the existing company_logo column.

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS contract_signature_image  text,
  ADD COLUMN IF NOT EXISTS contract_signatory_name   varchar(255),
  ADD COLUMN IF NOT EXISTS contract_signatory_title  varchar(255);

-- ── Verification ────────────────────────────────────────────────────
-- Expect 12 rows (the table's columns):
--
--   SELECT column_name, data_type, is_nullable
--     FROM information_schema.columns
--    WHERE table_name = 'contract_documents'
--    ORDER BY ordinal_position;
--
-- Expect 3 rows:
--
--   SELECT column_name, data_type
--     FROM information_schema.columns
--    WHERE table_name  = 'organizations'
--      AND column_name LIKE 'contract_%';
--
-- Expect 1 row (the unique index):
--
--   SELECT indexname FROM pg_indexes
--    WHERE tablename = 'contract_documents';

-- ── Rollback ────────────────────────────────────────────────────────
-- Only safe BEFORE the matching code is deployed.
--
--   DROP TABLE IF EXISTS contract_documents;
--   ALTER TABLE organizations
--     DROP COLUMN IF EXISTS contract_signature_image,
--     DROP COLUMN IF EXISTS contract_signatory_name,
--     DROP COLUMN IF EXISTS contract_signatory_title;
