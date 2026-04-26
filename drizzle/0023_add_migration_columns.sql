-- Phase 4A Delivery 25 — Project / Migration template foundation.
--
-- Adds the schema columns needed to support migration appendices on
-- branded proposals (Modern / Structured / Bold templates). The actual
-- renderer wiring + review-gate UI lands in Delivery 26.
--
-- This migration is APPLIED MANUALLY on the Render shell (drizzle-kit
-- push is broken on Render). Run via:
--
--   echo go; psql $DATABASE_URL < drizzle/0023_add_migration_columns.sql
--
-- After application, the schema files (shared/schema.ts and
-- drizzle/schema.ts) carry the matching column entries so the type
-- system stays in sync with the live DB.
--
-- ── Quote-level columns (7) ──────────────────────────────────────────
--
-- migration_methodology / migration_phases / migration_assumptions /
-- migration_risks / migration_rollback / migration_out_of_scope:
--   The six editable narrative blocks shown in the migration appendix.
--   NULL means "fall back to the org's default for the migration_type",
--   which itself falls back to the renderer's hard-coded default for
--   that profile.
--
-- migration_type_suggested:
--   Advisory column written by the inference helper inside
--   generateDraft. Values: 'server' | 'm365' | 'workspace' | 'tenant'
--   or NULL when the evidence has no migration signal. The user-
--   confirmed migration_type column (already applied) is what the
--   renderer reads — this _suggested column only feeds the review-gate
--   hint in Delivery 26.

ALTER TABLE quotes ADD COLUMN migration_methodology text;
ALTER TABLE quotes ADD COLUMN migration_phases text;
ALTER TABLE quotes ADD COLUMN migration_assumptions text;
ALTER TABLE quotes ADD COLUMN migration_risks text;
ALTER TABLE quotes ADD COLUMN migration_rollback text;
ALTER TABLE quotes ADD COLUMN migration_out_of_scope text;
ALTER TABLE quotes ADD COLUMN migration_type_suggested varchar(20);

-- ── Organisation-level columns (24) ──────────────────────────────────
--
-- Six narrative blocks × four migration profiles. Save-as-default ticks
-- in the Delivery 26 review gate write here; the org's default for the
-- relevant profile is then used as the second cascade layer when a
-- subsequent quote of the same migration_type is generated.

ALTER TABLE organizations ADD COLUMN default_server_methodology text;
ALTER TABLE organizations ADD COLUMN default_server_phases text;
ALTER TABLE organizations ADD COLUMN default_server_assumptions text;
ALTER TABLE organizations ADD COLUMN default_server_risks text;
ALTER TABLE organizations ADD COLUMN default_server_rollback text;
ALTER TABLE organizations ADD COLUMN default_server_out_of_scope text;

ALTER TABLE organizations ADD COLUMN default_m365_methodology text;
ALTER TABLE organizations ADD COLUMN default_m365_phases text;
ALTER TABLE organizations ADD COLUMN default_m365_assumptions text;
ALTER TABLE organizations ADD COLUMN default_m365_risks text;
ALTER TABLE organizations ADD COLUMN default_m365_rollback text;
ALTER TABLE organizations ADD COLUMN default_m365_out_of_scope text;

ALTER TABLE organizations ADD COLUMN default_workspace_methodology text;
ALTER TABLE organizations ADD COLUMN default_workspace_phases text;
ALTER TABLE organizations ADD COLUMN default_workspace_assumptions text;
ALTER TABLE organizations ADD COLUMN default_workspace_risks text;
ALTER TABLE organizations ADD COLUMN default_workspace_rollback text;
ALTER TABLE organizations ADD COLUMN default_workspace_out_of_scope text;

ALTER TABLE organizations ADD COLUMN default_tenant_methodology text;
ALTER TABLE organizations ADD COLUMN default_tenant_phases text;
ALTER TABLE organizations ADD COLUMN default_tenant_assumptions text;
ALTER TABLE organizations ADD COLUMN default_tenant_risks text;
ALTER TABLE organizations ADD COLUMN default_tenant_rollback text;
ALTER TABLE organizations ADD COLUMN default_tenant_out_of_scope text;
