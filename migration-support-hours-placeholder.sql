-- Delivery 2.10 — point existing contract clauses at Settings → Working Hours.
--
-- WHY THIS IS NEEDED
--   Contract documents are seeded into an organisation once, on first
--   read, and the org's copy is then authoritative — a later change to
--   the shipped seed text never overwrites it. Sweetbyte's Gold and
--   Silver documents were seeded on 11 Sep 2026 with the support hours
--   TYPED INTO the clause text (Gold: "Monday-Friday 9am-5pm", Silver:
--   "Monday-Friday 8:30am-5:30pm"). The code change in this delivery
--   replaces those with the {{supportHours}} placeholder in the SHIPPED
--   text only, so without this script the stored copies keep printing
--   their frozen hours and can still contradict the narrative.
--
--   Owner confirmed 14 Sep 2026: both packages are Monday to Friday,
--   8:30am-5:30pm. Settings is now the single source of truth, so the
--   clause takes the placeholder rather than the corrected literal.
--
-- SAFETY
--   Single transaction. Idempotent — re-running matches nothing because
--   the literal strings are gone after the first run. Touches ONLY the
--   two support-hours sentences; every other word of every clause,
--   including any edits made in Settings, is left exactly as it is.
--   Scoped to nothing in particular by org: any org whose clauses still
--   carry the shipped literals gets them replaced, which is correct —
--   they were all copies of the same seed text.
--
-- RUN BEFORE DEPLOYING THE CODE. Until the code ships, {{supportHours}}
-- is not a known placeholder and would print literally on a render.
-- The window between the two is the only risk; run this immediately
-- before the push.
--
-- VERIFY FIRST (should list the affected documents):
--   SELECT id, org_id, tier, display_name
--   FROM contract_documents
--   WHERE clauses::text LIKE '%9am-5pm%'
--      OR clauses::text LIKE '%8:30am-5:30pm%';

BEGIN;

UPDATE contract_documents
SET clauses = REPLACE(
      REPLACE(
        REPLACE(
          REPLACE(
            clauses::text,
            'Contracted support hours are Monday-Friday 9am-5pm excluding UK Bank Holidays.',
            'Contracted support hours are {{supportHours}} excluding UK Bank Holidays.'
          ),
          'Standard support hours are Monday-Friday 9am-5pm, excluding UK public holidays.',
          'Standard support hours are {{supportHours}}, excluding UK public holidays.'
        ),
        'Contracted support hours are Monday-Friday 8:30am-5:30pm excluding UK Bank Holidays.',
        'Contracted support hours are {{supportHours}} excluding UK Bank Holidays.'
      ),
      'Standard support hours are Monday-Friday 8:30am-5:30pm, excluding UK public holidays.',
      'Standard support hours are {{supportHours}}, excluding UK public holidays.'
    )::json
WHERE clauses::text LIKE '%support hours are Monday-Friday%';

COMMIT;

-- VERIFY AFTER (should return 0 rows):
--   SELECT id, org_id, tier FROM contract_documents
--   WHERE clauses::text LIKE '%Monday-Friday 9am-5pm%'
--      OR clauses::text LIKE '%Monday-Friday 8:30am-5:30pm%';
--
-- AND (should list your Gold and Silver rows):
--   SELECT id, org_id, tier FROM contract_documents
--   WHERE clauses::text LIKE '%{{supportHours}}%';
