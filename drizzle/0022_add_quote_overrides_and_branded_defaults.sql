-- Phase 4A — Review-before-Generate gate for Contract/Tender (Delivery 24).
--
-- Two sets of new columns:
--
-- 1. Per-quote overrides on `quotes` (3 columns).
--    The branded renderer reads payment terms + signatory name + signatory
--    position to populate the Terms page and the signature block. Until
--    today these came exclusively from organizations.default*. With the
--    review gate, the user can override per-quote — e.g. "this proposal
--    is signed by Mike (the senior partner) on Net 14 instead of our
--    usual Net 30". When the per-quote value is null, the renderer falls
--    back to organizations.brandedX, then organizations.defaultX, then
--    a hardcoded sensible default. Same cascade pattern that quote.terms
--    uses today.
--
-- 2. Per-mode defaults on `organizations` (5 columns).
--    "Save as my default" inside the review gate writes to a mode-specific
--    column so save-as-default in Quick Quote mode doesn't bleed into
--    Contract/Tender mode and vice versa. The five columns mirror the
--    fields the user can edit and persist from the branded review gate:
--    terms, exclusions, payment terms, signatory name, signatory position.
--
--    Quick Quote mode keeps using organizations.default* — those columns
--    stay where they are and become the explicit Quick Quote defaults.
--    The branded renderer's cascade now reads:
--      quote.X → organizations.brandedX → organizations.defaultX → fallback
--    so existing orgs that have set defaults in Settings continue to see
--    them in branded output until they explicitly fork by ticking
--    save-as-default in the branded review gate.
--
-- A future Project/Migration mode will follow the same pattern with a
-- migration_* prefix and the same cascade-through-default, no further
-- migration needed for the cascade itself.
--
-- Idempotent via IF NOT EXISTS — safe to re-run.

ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS payment_terms TEXT,
  ADD COLUMN IF NOT EXISTS signatory_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS signatory_position VARCHAR(255);

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS branded_terms TEXT,
  ADD COLUMN IF NOT EXISTS branded_exclusions TEXT,
  ADD COLUMN IF NOT EXISTS branded_payment_terms TEXT,
  ADD COLUMN IF NOT EXISTS branded_signatory_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS branded_signatory_position VARCHAR(255);
