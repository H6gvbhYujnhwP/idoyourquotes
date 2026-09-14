-- Delivery 2.12 — Xero push.
--
-- Three columns. All additive, IF NOT EXISTS, idempotent, safe to
-- re-run. No existing column or row is modified.
--
-- RUN BEFORE DEPLOYING THE CODE. The contract dialog and the Settings
-- page both read organizations.xero_month_year_suffix as soon as they
-- load; the preview reads quotes.xero_push.
--
-- Run in the Render shell:
--   echo go; psql $DATABASE_URL -f migration-xero-push.sql
--
-- WHAT EACH ONE IS FOR
--
--   organizations.xero_month_year_suffix
--     Append "(for [Month] [Year])" beneath the item name on MONTHLY
--     lines. Those brackets are Xero's own placeholders — it fills them
--     in on each invoice it raises. Sweetbyte's hand-built templates
--     carry this; it is OFF by default because it is a billing
--     convention rather than a product behaviour. Yearly lines never
--     get it.
--
--   organizations.xero_sales_account_code
--     Optional single default sales account for pushed lines. NULL
--     means send no account code and let Xero apply the organisation's
--     own default, which is the intended behaviour and the default.
--     It exists only because Xero's documentation is not explicit about
--     whether a line may omit AccountCode on a draft repeating invoice;
--     if a push is ever refused for that reason, setting this once
--     fixes every future push without a code change.
--
--   quotes.xero_push
--     What this quote created in Xero: the tenant, the contact, and the
--     ids of the repeating invoices and one-off invoice. Its existence
--     is what stops a re-render double-billing a client — a quote that
--     has been pushed shows a comparison instead of creating a second
--     set. NULL = never pushed.
--
-- ROLLBACK (loses the link between quotes and what they created in
-- Xero; the Xero documents themselves are untouched):
--   ALTER TABLE quotes DROP COLUMN IF EXISTS xero_push;
--   ALTER TABLE organizations
--     DROP COLUMN IF EXISTS xero_month_year_suffix,
--     DROP COLUMN IF EXISTS xero_sales_account_code;

BEGIN;

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS xero_month_year_suffix  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS xero_sales_account_code varchar(20);

ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS xero_push json;

COMMIT;

-- VERIFY (should return three rows):
--   SELECT table_name, column_name FROM information_schema.columns
--   WHERE (table_name = 'organizations'
--          AND column_name IN ('xero_month_year_suffix','xero_sales_account_code'))
--      OR (table_name = 'quotes' AND column_name = 'xero_push');
--
-- Sweetbyte wants the month placeholder on. Either tick it on the Xero
-- tab in Settings, or set it here:
--   UPDATE organizations SET xero_month_year_suffix = true WHERE id = 10;
--
-- After a push, this shows what the quote created:
--   SELECT id, reference, xero_push FROM quotes WHERE xero_push IS NOT NULL;
