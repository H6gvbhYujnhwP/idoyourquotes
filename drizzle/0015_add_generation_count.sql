-- Chunk 3 Delivery F — one-shot re-generate gating.
--
-- Adds a generation counter on quotes to enforce: every user, every tier,
-- gets exactly one initial Generate + one Re-generate per quote. After
-- that the quote is locked for AI rebuilds (manual edits still allowed).
-- Stops users from gaming tier limits by swapping evidence and re-running.
--
-- 0 = never generated, 1 = generated once, 2 = re-generated (locked).
-- The generateDraft mutation refuses calls when this reaches 2.
--
-- Pre-existing quotes default to 0. The mutation handles legacy quotes
-- with existing line items by jumping the counter straight to 2 on their
-- next call — they get the one Re-generate same as everyone else, no
-- grandfathering quirks.
--
-- Idempotent via IF NOT EXISTS — safe to re-run.

ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS generation_count INTEGER NOT NULL DEFAULT 0;
