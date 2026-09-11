/**
 * VAT rate helpers — VAT fix delivery (delivery 1 of the Xero sequence).
 *
 * WHY THIS FILE EXISTS:
 *   Before this delivery, "what VAT rate applies" was answered in four
 *   different places with four different answers:
 *     - Settings displayed 20% when nothing had ever been saved, so the
 *       organisation's stored value was absent while the screen claimed
 *       20%. New quotes then silently got 0%.
 *     - The colour-template proposal (slotContentBuilder) treated 0% as
 *       20% (`|| 20`), hiding the missing data.
 *     - The brochure proposal treated 0% as "no VAT".
 *     - The contract printed "including VAT at 0%".
 *   This file is the single definition both halves now share.
 *
 * THE RULE, AFTER THIS DELIVERY:
 *   - Organisation: `defaultDayWorkRates.defaultVatRate` is always a
 *     stored number. 0 means "not VAT registered". Any positive number
 *     is the registered rate. Absent (legacy rows, pre-backfill) reads
 *     as 20% — exactly what the Settings screen has always shown, so
 *     the system now agrees with what the user was told.
 *   - Quote: `quotes.tax_rate` is the rate that quote carries. 0 means
 *     "no VAT applicable". There is no "unset" state any more: every
 *     creation path stamps the organisation's rate (see createQuote in
 *     server/db.ts), and the one-time backfill corrected the historical
 *     zeros.
 *
 * XERO NOTE:
 *   The Xero integration never sends IDYQ's VAT figure. It sends ex-VAT
 *   line prices and lets Xero calculate VAT from its own tax rate. These
 *   helpers only govern what IDYQ prints on its own documents.
 *
 * No imports on purpose — server/db.ts imports this, and a helper that
 * imported db.ts back would create a cycle.
 */

/** The UK standard rate. The default for a new organisation and the
 *  reading for any organisation with no stored value. */
export const DEFAULT_UK_VAT_RATE = 20;

/** Parse any stored rate representation into a clean number, or null
 *  when it is missing or not a sensible percentage. */
function toRate(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = typeof raw === "number" ? raw : parseFloat(String(raw));
  if (!Number.isFinite(n) || n < 0 || n > 100) return null;
  return n;
}

/**
 * The organisation's VAT rate.
 *
 * Returns the stored `defaultDayWorkRates.defaultVatRate` when present
 * (including an explicit 0 for "not VAT registered"), otherwise 20.
 * Accepts `any` because callers hold organisation rows typed from either
 * schema file, and the JSON column is loosely typed in both.
 */
export function resolveOrgVatRate(org: any): number {
  const stored = toRate(org?.defaultDayWorkRates?.defaultVatRate);
  return stored === null ? DEFAULT_UK_VAT_RATE : stored;
}

/**
 * The VAT rate a quote carries, as a number.
 *
 * 0 means "no VAT applicable" and is returned as 0 — never promoted to
 * 20. Missing or corrupt values also read as 0, which is the column's
 * database default; after this delivery no creation path leaves it
 * unset, so that case only arises for a corrupt row.
 */
export function parseQuoteVatRate(raw: unknown): number {
  const n = toRate(raw);
  return n === null ? 0 : n;
}

/** True when a rate means VAT should be charged and printed. */
export function isVatCharged(rate: number): boolean {
  return rate > 0;
}

/**
 * A rate as printed on a document: whole numbers without decimals
 * ("20"), fractional rates kept ("17.5"). Replaces the original quote
 * PDF's `.toFixed(0)`, which rounded 17.5% up to "18%".
 */
export function formatVatRate(rate: number): string {
  return String(Number(rate.toFixed(2)));
}
