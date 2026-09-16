import {
  buildPushPlan, buildLineDescription, resolveStartDate,
  normaliseCadence, buildRepeatingInvoicePayload, buildOneOffInvoicePayload, diffLines,
} from "../server/services/xeroInvoicePlan";

let fail = 0;
const ok = (name: string, cond: boolean, extra?: any) => {
  if (!cond) { fail++; console.log("  FAIL", name, extra ?? ""); }
  else console.log("  ok  ", name);
};

// ── Real Sorrells lines, from the contract PDF ──────────────────────
const L = (id: number, name: string, qty: number, rate: number, disc: number|null,
           type: string, opt = false) => ({
  id, itemName: name, description: name, quantity: qty, unit: "User",
  rate, total: 0, pricingType: type, discountPercent: disc, isOptional: opt, sortOrder: id,
});

const sorrells = [
  L(1, "Silver IT Support — Unlimited Remote", 22, 20, 11, "monthly"),
  L(2, "Silver IT Support (Server)", 1, 45, 11, "monthly"),
  L(3, "Security Stack — MDR Advanced + SentinelOne EDR", 23, 12, 11, "monthly"),
  L(4, "Advanced Email Protection", 30, 2, null, "monthly"),
  L(5, "Cloud Backup Device", 1, 68, null, "monthly"),
  L(6, "SharePoint Company Data Daily Backup", 1, 39, null, "monthly"),
  L(7, "SaaS Protect Backup", 30, 3, null, "monthly"),
  L(8, "Microsoft 365 Business Basic", 4, 4.83, null, "monthly"),
  L(9, "Microsoft 365 Business Standard", 18, 10.08, null, "monthly"),
  L(10, "Microsoft 365 Copilot Business (add-on)", 3, 26.52, null, "monthly"),
  L(11, "Keeper Password Manager", 22, 5, 11, "monthly"),
  L(12, "SOGEA Broadband — Unit 11", 1, 29, null, "monthly"),
  L(13, "SOGEA Broadband — 17 Brook Rd", 1, 29, null, "monthly"),
];

console.log("\n=== 1. Sorrells monthly total must match the signed contract ===");
let plan = buildPushPlan(sorrells, {
  vatRate: 20, taxType: "OUTPUT2", monthYearSuffix: true, accountCode: "200",
  commencementDate: "1 October 2026", reference: "Silver IT Support & Services",
});
const monthly = plan.groups.find(g => g.cadence === "monthly")!;
ok("one group only (all monthly)", plan.groups.length === 1);
ok("13 lines", monthly.lines.length === 13);
ok("subtotal = £1,370.51", monthly.subTotal === 1370.51, monthly.subTotal);
ok("VAT = £274.10", monthly.vat === 274.1, monthly.vat);
ok("no blockers", plan.blockers.length === 0, plan.blockers);
ok("start date = 2026-10-01", plan.startDate === "2026-10-01", plan.startDate);

console.log("\n=== 2. Discounts sent as list price + rate, never baked in ===");
const first = monthly.lines[0];
ok("unit price is the LIST price 20.00", first.UnitAmount === 20);
ok("discount sent as 11", first.DiscountRate === 11);
ok("tax type explicit on every line", monthly.lines.every(l => l.TaxType === "OUTPUT2"));
// Xero confirmed on the first real push that AccountCode is REQUIRED, so
// the original "we send none" expectation was wrong. What matters now is
// that the configured code reaches every line, and that none is invented
// when the organisation has not set one.
ok("configured account code on every line", monthly.lines.every(l => l.AccountCode === "200"));
const noCode = buildPushPlan(sorrells, { vatRate: 20, taxType: "OUTPUT2",
  commencementDate: "1 October 2026", reference: "R" });
ok("no code invented when unset",
   noCode.groups[0].lines.every(l => l.AccountCode === undefined));
ok("undiscounted line carries no DiscountRate", monthly.lines[3].DiscountRate === undefined);

console.log("\n=== 3. Month placeholder: monthly only, and only when enabled ===");
ok("monthly line has (for [Month] [Year])", first.Description.includes("(for [Month] [Year])"));
const noSuffix = buildPushPlan(sorrells, {
  vatRate: 20, taxType: "OUTPUT2", monthYearSuffix: false,
  commencementDate: "1 October 2026", reference: "R",
});
ok("off by default -> absent",
   !noSuffix.groups[0].lines[0].Description.includes("[Month]"));
const annualLine = { ...L(99, "Annual thing", 1, 100, null, "annual") };
const annualPlan = buildPushPlan([annualLine], {
  vatRate: 20, taxType: "OUTPUT2", monthYearSuffix: true,
  commencementDate: "1 October 2026", reference: "R",
});
ok("annual line never gets the placeholder",
   !annualPlan.groups[0].lines[0].Description.includes("[Month]"));

console.log("\n=== 4. Optional lines excluded; zero-price lines block ===");
const withOptional = [...sorrells, L(20, "Optional extra", 1, 50, null, "monthly", true)];
plan = buildPushPlan(withOptional, { vatRate: 20, taxType: "OUTPUT2",
  commencementDate: "1 October 2026", reference: "R" });
ok("optional not billed", plan.groups[0].lines.length === 13);
ok("optional listed as excluded", plan.excluded.length === 1 && /Optional/.test(plan.excluded[0].reason));
const withZero = [...sorrells, L(21, "Free thing", 1, 0, null, "monthly")];
plan = buildPushPlan(withZero, { vatRate: 20, taxType: "OUTPUT2",
  commencementDate: "1 October 2026", reference: "R" });
ok("zero price blocks the push", plan.blockers.some(b => b.code === "zero-rate"), plan.blockers);

console.log("\n=== 5. Three cadences split into three documents ===");
plan = buildPushPlan([
  L(1, "Monthly", 1, 10, null, "monthly"),
  L(2, "Yearly", 1, 120, null, "annual"),
  L(3, "Setup", 1, 500, null, "one_off"),
], { vatRate: 20, taxType: "OUTPUT2", commencementDate: "1 October 2026", reference: "R" });
ok("three groups", plan.groups.length === 3, plan.groups.map(g => g.cadence));
ok("live data's one_off maps to oneOff", normaliseCadence("one_off") === "oneOff");
ok("legacy 'standard' maps to oneOff too", normaliseCadence("standard") === "oneOff");
ok("unknown type bills once, not forever", normaliseCadence("weekly") === "oneOff");

console.log("\n=== 6. Start date = 1st on or after commencement ===");
ok("mid-month rolls to next 1st", resolveStartDate("15 October 2026") === "2026-11-01");
ok("already the 1st stays", resolveStartDate("1 October 2026") === "2026-10-01");
ok("unparseable free text -> null", resolveStartDate("early October") === null);
plan = buildPushPlan(sorrells, { vatRate: 20, taxType: "OUTPUT2",
  commencementDate: "early October", reference: "R" });
ok("unparseable date blocks a repeating push",
   plan.blockers.some(b => b.code === "no-start-date"));

console.log("\n=== 7. VAT mismatch blocks before it can bill wrongly ===");
plan = buildPushPlan(sorrells, { vatRate: 20, taxType: null,
  commencementDate: "1 October 2026", reference: "R" });
ok("no tax type + VAT registered = blocked",
   plan.blockers.some(b => b.code === "no-tax-type"));
plan = buildPushPlan(sorrells, { vatRate: 0, taxType: null, accountCode: "200",
  commencementDate: "1 October 2026", reference: "R" });
ok("not VAT registered is fine", plan.blockers.length === 0, plan.blockers);
ok("and sends no tax type", plan.groups[0].lines[0].TaxType === undefined);

console.log("\n=== 8. Payload shape ===");
const payload: any = buildRepeatingInvoicePayload({
  contactId: "abc", group: monthly, startDate: "2026-10-01", reference: "R",
});
ok("ACCREC sales invoice", payload.Type === "ACCREC");
ok("DRAFT, so nothing emails a client", payload.Status === "DRAFT");
ok("monthly period 1", payload.Schedule.Period === 1 && payload.Schedule.Unit === "MONTHLY");
ok("due 14 days after bill date", payload.Schedule.DueDate === 14 && payload.Schedule.DueDateType === "DAYSAFTERBILLDATE");
ok("prices are ex-VAT", payload.LineAmountTypes === "Exclusive");
const annualPayload: any = buildRepeatingInvoicePayload({
  contactId: "abc", group: { ...monthly, cadence: "annual" }, startDate: "2026-10-01", reference: "R",
});
ok("annual = every 12 months", annualPayload.Schedule.Period === 12);
const oneOff: any = buildOneOffInvoicePayload({
  contactId: "abc", group: monthly, startDate: "2026-10-01", reference: "R",
});
ok("one-off is a dated draft, no schedule",
   oneOff.Status === "DRAFT" && oneOff.Date === "2026-10-01" && oneOff.DueDate === "2026-10-15" && !oneOff.Schedule);

console.log("\n=== 9. Comparison on re-push ===");
const before = monthly.lines;
const changed = before.map((l, i) =>
  i === 0 ? { ...l, Quantity: 25 } : l).filter((_, i) => i !== 1)
  .concat([{ Description: "New service", Quantity: 1, UnitAmount: 99, LineAmount: 99 }]);
const diffs = diffLines(before, changed);
ok("quantity change spotted", diffs.some(d => d.status === "changed" && d.after?.quantity === 25));
ok("removed line spotted", diffs.some(d => d.status === "removed"));
ok("added line spotted", diffs.some(d => d.status === "added" && d.description === "New service"));
ok("untouched lines marked unchanged", diffs.filter(d => d.status === "unchanged").length === 11,
   diffs.filter(d => d.status === "unchanged").length);

console.log("\n=== 10. LineAmount and account code (delivery 2.12b) ===");
const g10 = plan.groups[0];
ok("LineAmount sent on every line", g10.lines.every(l => typeof l.LineAmount === "number"));
ok("matches Xero's own formula", g10.lines.every(l => {
  const exp = Math.round(l.Quantity * l.UnitAmount * ((100 - (l.DiscountRate ?? 0)) / 100) * 100) / 100;
  return Math.abs(l.LineAmount - exp) < 0.001;
}));
ok("discounted line is 391.60, the figure Xero rejected", g10.lines[0].LineAmount === 391.6, g10.lines[0].LineAmount);
const noAcct = buildPushPlan(sorrells, { vatRate: 20, taxType: "OUTPUT2",
  commencementDate: "1 October 2026", reference: "R" });
ok("missing account code blocks before Xero sees it",
   noAcct.blockers.some(b => b.code === "no-account-code"));

console.log(fail === 0 ? "\nALL CHECKS PASSED" : `\n${fail} CHECK(S) FAILED`);
process.exit(fail === 0 ? 0 : 1);
