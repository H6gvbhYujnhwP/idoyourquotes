-- Beta-2 Chunk 2b-ii — drop the qds_summary_json adapter column on quotes.
--
-- Context: this column was introduced in 0010 as a handoff between the
-- (then three-step) Generate Quote flow. After 2b-i collapsed the flow
-- to one round-trip and 2b-ii populates line-item provenance directly
-- at creation time, nothing in the four-sector app reads or writes this
-- column anymore. Dropping it here.
--
-- Idempotent via IF EXISTS — safe to run on environments where the
-- column has already been removed by a prior rollout.

ALTER TABLE quotes DROP COLUMN IF EXISTS qds_summary_json;
