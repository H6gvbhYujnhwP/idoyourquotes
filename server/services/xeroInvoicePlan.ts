/**
 * Turning a quote into Xero documents.
 *
 * Delivery 2.12. This file is deliberately PURE — it takes a quote, its
 * line items and the organisation's settings, and returns exactly what
 * would be sent to Xero. No network, no database. That is what makes the
 * preview screen trustworthy: the user is shown the same objects that
 * are later posted, not a description of them.
 *
 * WHAT GETS CREATED, from one quote:
 *   - one MONTHLY repeating invoice, if the quote has monthly lines;
 *   - one 12-MONTHLY repeating invoice, if it has annual lines — kept
 *     separate because a yearly commitment billed yearly cannot share a
 *     schedule with a monthly one;
 *   - one DRAFT invoice for any one-off lines, not repeating;
 *   - nothing at all for optional lines.
 *
 * RULES THAT ARE EASY TO GET WRONG, and why they are what they are:
 *
 * OPTIONAL IS A FLAG, NOT A TYPE. The database holds is_optional as a
 * boolean alongside pricing_type. Filtering on the type alone would send
 * every optional line to a client as a real charge.
 *
 * PRICING TYPES ARE one_off / monthly / annual. The TypeScript union
 * elsewhere calls the first "standard", and the live data says "one_off".
 * Both are accepted; anything unrecognised is treated as one-off, which
 * bills once rather than forever — the safe direction to be wrong in.
 *
 * PRICES ARE EX-VAT AND UNDISCOUNTED. UnitAmount carries the LIST price
 * and DiscountRate carries the percentage, so the client sees what they
 * were given rather than a quietly reduced rate. This only works because
 * delivery 2.7 stopped baking discounts into the rate.
 *
 * TAX TYPE IS ALWAYS EXPLICIT. Xero falls back to the default rate on
 * the account a line is coded to, and ignores contact defaults. Since we
 * send no account code by default, an omitted tax type could raise
 * invoices with no VAT at all.
 */
import { descriptionAsText } from "../../shared/lineItemDescription";

export type Cadence = "monthly" | "annual" | "oneOff";

export interface PlanLineSource {
  id: number;
  itemName?: string | null;
  description: string;
  quantity: number;
  unit?: string | null;
  rate: number;
  total: number;
  pricingType?: string | null;
  discountPercent?: number | null;
  isOptional?: boolean | null;
  sortOrder?: number | null;
}

export interface XeroLineItem {
  Description: string;
  Quantity: number;
  UnitAmount: number;
  DiscountRate?: number;
  TaxType?: string;
  AccountCode?: string;
}

export interface PlanGroup {
  cadence: Cadence;
  /** What this becomes in Xero, in plain words, for the preview. */
  label: string;
  lines: XeroLineItem[];
  /** Ex-VAT total after discounts — what Xero will compute. */
  subTotal: number;
  /** VAT Xero will add, for display only; never sent. */
  vat: number;
}

export interface PlanBlocker {
  code: string;
  message: string;
}

export interface PushPlan {
  groups: PlanGroup[];
  /** Lines deliberately not sent, so their absence is visible. */
  excluded: Array<{ id: number; name: string; reason: string }>;
  blockers: PlanBlocker[];
  /** yyyy-mm-dd the repeating invoices start on. */
  startDate: string | null;
  taxType: string | null;
  vatRate: number;
  accountCode: string | null;
  reference: string;
}

export interface PlanOptions {
  /** The organisation's VAT rate. 0 = not charged. */
  vatRate: number;
  /** Tenant's code for that rate, e.g. OUTPUT2. Null when not charged. */
  taxType: string | null;
  /** Optional org-level default sales account. Null = let Xero decide. */
  accountCode?: string | null;
  /** Append "(for [Month] [Year])" to monthly lines. */
  monthYearSuffix?: boolean;
  /** Free text the user typed on the contract dialog. */
  commencementDate?: string | null;
  /** Shown in Xero's Reference field. */
  reference: string;
}

/** Xero's own placeholders — it substitutes these per issued invoice. */
const MONTH_YEAR_PLACEHOLDER = "(for [Month] [Year])";

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function normaliseCadence(pricingType?: string | null): Cadence {
  const t = (pricingType ?? "").trim().toLowerCase();
  if (t === "monthly") return "monthly";
  if (t === "annual") return "annual";
  // "one_off", "standard", "", or anything unexpected. Billing once is
  // the safe failure: a mis-typed line costs one invoice, not a
  // subscription nobody notices.
  return "oneOff";
}

/**
 * The text a client reads on the invoice, every month, for years.
 *
 * Item name first, then Xero's month placeholder on monthly lines when
 * the organisation wants it, then the description's own lines. Matches
 * the shape of the hand-built templates it replaces.
 */
export function buildLineDescription(
  line: PlanLineSource,
  cadence: Cadence,
  monthYearSuffix: boolean,
): string {
  const parts: string[] = [];
  const name = (line.itemName ?? "").trim();
  const body = descriptionAsText(line.description ?? "").trim();

  if (name) {
    parts.push(name);
    if (cadence === "monthly" && monthYearSuffix) {
      parts.push(MONTH_YEAR_PLACEHOLDER);
    }
    if (body && body !== name) parts.push("", body);
  } else {
    // No item name — the description's first line is doing that job.
    if (cadence === "monthly" && monthYearSuffix) {
      const [first, ...rest] = body.split("\n");
      parts.push(first, MONTH_YEAR_PLACEHOLDER);
      if (rest.length) parts.push("", rest.join("\n"));
    } else {
      parts.push(body);
    }
  }
  // Xero caps a line description at 4000 characters.
  return parts.join("\n").trim().slice(0, 4000);
}

/**
 * The first of the month on or after the commencement date.
 *
 * Clause 12 of the contract says invoices are issued on the 1st, so a
 * template that starts mid-month would contradict the document the
 * client just signed. A commencement date that already IS the 1st is
 * used as-is. Free text that doesn't parse ("early October") returns
 * null, and the preview asks for a real date rather than guessing.
 */
export function resolveStartDate(commencementDate?: string | null): string | null {
  const raw = (commencementDate ?? "").trim();
  if (!raw) return null;
  const parsed = new Date(raw);
  if (isNaN(parsed.getTime())) return null;
  const y = parsed.getFullYear();
  const m = parsed.getMonth();
  const d = parsed.getDate();
  const first = d === 1 ? new Date(y, m, 1) : new Date(y, m + 1, 1);
  const mm = String(first.getMonth() + 1).padStart(2, "0");
  return `${first.getFullYear()}-${mm}-01`;
}

const CADENCE_LABELS: Record<Cadence, string> = {
  monthly: "Monthly repeating invoice",
  annual: "Yearly repeating invoice (every 12 months)",
  oneOff: "One-off draft invoice",
};

export function buildPushPlan(
  lineItems: PlanLineSource[],
  options: PlanOptions,
): PushPlan {
  const excluded: PushPlan["excluded"] = [];
  const blockers: PlanBlocker[] = [];

  const buckets: Record<Cadence, PlanLineSource[]> = {
    monthly: [],
    annual: [],
    oneOff: [],
  };

  for (const li of lineItems) {
    const name = (li.itemName ?? li.description ?? "").split("\n")[0].trim();

    if (li.isOptional) {
      excluded.push({
        id: li.id,
        name,
        reason: "Optional — never sent to Xero",
      });
      continue;
    }
    if (!Number.isFinite(li.rate) || li.rate <= 0) {
      // A £0.00 row on a real invoice looks like a mistake to a client
      // and usually is one. Refuse rather than quietly bill nothing.
      blockers.push({
        code: "zero-rate",
        message: `"${name || `Line ${li.id}`}" has no price. Set a price or mark the line optional.`,
      });
      continue;
    }
    if (!Number.isFinite(li.quantity) || li.quantity <= 0) {
      blockers.push({
        code: "zero-quantity",
        message: `"${name || `Line ${li.id}`}" has no quantity.`,
      });
      continue;
    }
    buckets[normaliseCadence(li.pricingType)].push(li);
  }

  const groups: PlanGroup[] = [];
  for (const cadence of ["monthly", "annual", "oneOff"] as Cadence[]) {
    const rows = buckets[cadence]
      .slice()
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    if (rows.length === 0) continue;

    const lines: XeroLineItem[] = rows.map((li) => {
      const discount =
        li.discountPercent && li.discountPercent > 0
          ? Math.min(li.discountPercent, 100)
          : undefined;
      const item: XeroLineItem = {
        Description: buildLineDescription(
          li,
          cadence,
          !!options.monthYearSuffix,
        ),
        Quantity: li.quantity,
        UnitAmount: li.rate,
      };
      if (discount !== undefined) item.DiscountRate = discount;
      if (options.taxType) item.TaxType = options.taxType;
      if (options.accountCode) item.AccountCode = options.accountCode;
      return item;
    });

    const subTotal = round2(
      rows.reduce(
        (sum, li) =>
          sum +
          li.quantity *
            li.rate *
            (1 - (li.discountPercent && li.discountPercent > 0
              ? Math.min(li.discountPercent, 100)
              : 0) / 100),
        0,
      ),
    );

    groups.push({
      cadence,
      label: CADENCE_LABELS[cadence],
      lines,
      subTotal,
      vat: round2(subTotal * (options.vatRate / 100)),
    });
  }

  if (groups.length === 0 && blockers.length === 0) {
    blockers.push({
      code: "no-lines",
      message: "This quote has nothing to bill — every line is optional or empty.",
    });
  }

  const startDate = resolveStartDate(options.commencementDate);
  const needsSchedule = groups.some((g) => g.cadence !== "oneOff");
  if (needsSchedule && !startDate) {
    blockers.push({
      code: "no-start-date",
      message:
        "Enter the start date as a real date (e.g. 1 October 2026) so the repeating invoices know when to begin.",
    });
  }

  if (options.vatRate > 0 && !options.taxType) {
    blockers.push({
      code: "no-tax-type",
      message:
        `Your VAT rate is ${options.vatRate}% but no matching sales tax rate was found in Xero. ` +
        "Invoices would be raised with no VAT. Check the rates on the Xero tab in Settings.",
    });
  }

  return {
    groups,
    excluded,
    blockers,
    startDate,
    taxType: options.taxType,
    vatRate: options.vatRate,
    accountCode: options.accountCode ?? null,
    reference: options.reference,
  };
}

/**
 * The repeating-invoice body Xero expects for one cadence.
 *
 * Status DRAFT is the whole safety story: Xero saves each issued invoice
 * as a draft instead of emailing it, so nothing reaches a client until a
 * human approves it. Due date follows contract clause 12 — payable
 * within 14 days of the invoice date.
 */
export function buildRepeatingInvoicePayload(params: {
  contactId: string;
  group: PlanGroup;
  startDate: string;
  reference: string;
}): Record<string, unknown> {
  const { contactId, group, startDate, reference } = params;
  const period = group.cadence === "annual" ? 12 : 1;
  return {
    Type: "ACCREC",
    Contact: { ContactID: contactId },
    Schedule: {
      Period: period,
      Unit: "MONTHLY",
      StartDate: startDate,
      DueDate: 14,
      DueDateType: "DAYSAFTERBILLDATE",
    },
    LineAmountTypes: "Exclusive",
    LineItems: group.lines,
    Reference: reference.slice(0, 255),
    Status: "DRAFT",
  };
}

/**
 * The one-off draft invoice. Dated the start date where we have one,
 * otherwise today; due 14 days later, same as the recurring terms.
 */
export function buildOneOffInvoicePayload(params: {
  contactId: string;
  group: PlanGroup;
  startDate: string | null;
  reference: string;
}): Record<string, unknown> {
  const { contactId, group, startDate, reference } = params;
  const date = startDate ?? new Date().toISOString().slice(0, 10);
  const due = new Date(date);
  due.setDate(due.getDate() + 14);
  return {
    Type: "ACCREC",
    Contact: { ContactID: contactId },
    Date: date,
    DueDate: due.toISOString().slice(0, 10),
    LineAmountTypes: "Exclusive",
    LineItems: group.lines,
    Reference: reference.slice(0, 255),
    Status: "DRAFT",
  };
}

// ─── Comparison, for a quote that has already been pushed ────────────

export interface LineDiff {
  status: "added" | "removed" | "changed" | "unchanged";
  description: string;
  before?: { quantity: number; unitAmount: number; discountRate?: number };
  after?: { quantity: number; unitAmount: number; discountRate?: number };
}

/**
 * Compare what Xero currently holds against what the quote now says.
 *
 * Matched on the FIRST LINE of the description — the item name. Matching
 * on the whole description would report a chapter of wording changes as
 * a different product; matching on position would treat one inserted row
 * as every row changing.
 */
export function diffLines(
  existing: XeroLineItem[],
  next: XeroLineItem[],
): LineDiff[] {
  const key = (l: XeroLineItem) =>
    (l.Description ?? "").split("\n")[0].trim().toLowerCase();

  // Plain objects rather than Maps: this codebase compiles without
  // downlevelIteration, so iterating a Map here would not build.
  const before: Record<string, XeroLineItem> = {};
  existing.forEach((l) => {
    before[key(l)] = l;
  });
  const after: Record<string, XeroLineItem> = {};
  next.forEach((l) => {
    after[key(l)] = l;
  });
  const diffs: LineDiff[] = [];

  Object.keys(after).forEach((k) => {
    const l = after[k];
    const prev = before[k];
    if (!prev) {
      diffs.push({
        status: "added",
        description: l.Description.split("\n")[0],
        after: {
          quantity: l.Quantity,
          unitAmount: l.UnitAmount,
          discountRate: l.DiscountRate,
        },
      });
      return;
    }
    const same =
      prev.Quantity === l.Quantity &&
      prev.UnitAmount === l.UnitAmount &&
      (prev.DiscountRate ?? 0) === (l.DiscountRate ?? 0) &&
      prev.Description === l.Description;
    diffs.push({
      status: same ? "unchanged" : "changed",
      description: l.Description.split("\n")[0],
      before: {
        quantity: prev.Quantity,
        unitAmount: prev.UnitAmount,
        discountRate: prev.DiscountRate,
      },
      after: {
        quantity: l.Quantity,
        unitAmount: l.UnitAmount,
        discountRate: l.DiscountRate,
      },
    });
  });

  Object.keys(before).forEach((k) => {
    if (after[k]) return;
    const l = before[k];
    diffs.push({
      status: "removed",
      description: l.Description.split("\n")[0],
      before: {
        quantity: l.Quantity,
        unitAmount: l.UnitAmount,
        discountRate: l.DiscountRate,
      },
    });
  });
  return diffs;
}
