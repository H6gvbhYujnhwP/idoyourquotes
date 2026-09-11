-- migration-vat-backfill.sql
--
-- VAT fix delivery (delivery 1 of the Xero sequence). DATA ONLY — no
-- schema change, no columns added or altered.
--
-- WHAT IT CORRECTS:
--   1. Organisations that never pressed Save on Settings had no stored
--      VAT rate, while the Settings screen displayed "20%". They are
--      given the 20% they were shown. An organisation that explicitly
--      saved 0 (not VAT registered) is NOT touched.
--   2. Quotes stuck at 0% inside a VAT-registered organisation. There
--      has never been a screen to set 0% on an individual quote, so
--      every one of these is the silent-default bug, not a choice.
--      Each gets its organisation's rate, and its VAT amount and total
--      are recalculated exactly as recalculateQuoteTotals does:
--        tax_amount = subtotal x rate / 100   (2dp)
--        total      = subtotal + tax_amount
--      Subtotal, monthly_total and annual_total are unchanged (VAT is
--      only ever added to the one-off subtotal in IDYQ).
--
-- IDEMPOTENT: a second run finds nothing to change and updates 0 rows.
-- Runs in one transaction — all or nothing.
--
-- Order: safe to run before or after the code deploy. Recommended
-- before, so the new code never meets an organisation without a rate.

BEGIN;

-- 1. Organisations with no stored VAT rate -> 20%.
UPDATE organizations
SET default_day_work_rates = (
      COALESCE(default_day_work_rates::jsonb, '{}'::jsonb)
      || '{"defaultVatRate": 20}'::jsonb
    )::json
WHERE default_day_work_rates IS NULL
   OR (default_day_work_rates->>'defaultVatRate') IS NULL
   OR (default_day_work_rates->>'defaultVatRate') = '';

-- 2. Zero-VAT quotes in VAT-registered organisations -> org rate,
--    with VAT amount and total recalculated.
UPDATE quotes q
SET tax_rate   = (o.default_day_work_rates->>'defaultVatRate')::numeric,
    tax_amount = ROUND(COALESCE(q.subtotal, 0)
                   * (o.default_day_work_rates->>'defaultVatRate')::numeric / 100, 2),
    total      = COALESCE(q.subtotal, 0)
                 + ROUND(COALESCE(q.subtotal, 0)
                   * (o.default_day_work_rates->>'defaultVatRate')::numeric / 100, 2)
FROM organizations o
WHERE q.org_id = o.id
  AND COALESCE(q.tax_rate, 0) = 0
  AND (o.default_day_work_rates->>'defaultVatRate')::numeric > 0;

COMMIT;

-- Verification (read-only): every organisation should now show an
-- org_vat value, and zero_vat_quotes should be 0 for every organisation
-- whose org_vat is above 0.
SELECT o.id, o.name,
       o.default_day_work_rates->>'defaultVatRate' AS org_vat,
       COUNT(q.id) AS quotes,
       COUNT(q.id) FILTER (WHERE q.tax_rate = 0) AS zero_vat_quotes
FROM organizations o
LEFT JOIN quotes q ON q.org_id = o.id
GROUP BY o.id
ORDER BY o.id;
