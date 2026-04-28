-- Phase 4A Delivery 39 — Email evidence parsing (.eml + .msg)
--
-- Defensive idempotent ALTER TYPE that ensures the `input_type` enum on
-- the live Postgres DB carries the 'email' value. Both shared/schema.ts
-- and drizzle/schema.ts already list it, and the original 0000 migration
-- declared it, so on a healthy DB this migration is a no-op. We ship it
-- anyway as belt-and-braces — if the live enum has drifted (e.g. from
-- an earlier failed drizzle-kit push) the email branch of the auto-
-- analyze pipeline would reject every upload at the DB level otherwise.
--
-- This migration is APPLIED MANUALLY on the Render shell (drizzle-kit
-- push is broken on Render). Run via:
--
--   echo go; psql $DATABASE_URL < drizzle/0024_add_email_input_type.sql
--
-- IF NOT EXISTS makes this safe to re-run; ADD VALUE on a Postgres enum
-- cannot run inside a transaction block, which is why each statement is
-- standalone (no BEGIN/COMMIT wrapper).
--
-- After application, no further wiring is required — the schema files
-- and the routers already reference the email value.

ALTER TYPE input_type ADD VALUE IF NOT EXISTS 'email';
ALTER TYPE input_type ADD VALUE IF NOT EXISTS 'document';
