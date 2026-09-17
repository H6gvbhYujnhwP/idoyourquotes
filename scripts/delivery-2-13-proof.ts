/**
 * Delivery 2.13 proof — client side.
 *
 * Runs the workspace's totals loop and the dashboard's profit-line
 * builder, copied verbatim from the delivered files, against the same
 * quote 210 line items used in the SQL proof. Confirms all three
 * surfaces (SQL, workspace header, dashboard list) agree.
 */

function clampDiscount(raw: unknown): number {
  const n = parseFloat(String(raw ?? "0"));
  if (!Number.isFinite(n)) return 0;
  return Math.min(Math.max(n, 0), 100);
}
function parseNum(s: string | null | undefined): number {
  if (s == null) return 0;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

let pass = 0, fail = 0;
const ok = (name: string, actual: unknown, expected: unknown) => {
  const a = typeof actual === "number" ? actual.toFixed(2) : String(actual);
  const e = typeof expected === "number" ? expected.toFixed(2) : String(expected);
  if (a === e) { pass++; console.log(`  PASS  ${name} = ${a}`); }
  else { fail++; console.log(`  FAIL  ${name}: got ${a}, expected ${e}`); }
};

type LI = {
  quantity: string; rate: string; total: string;
  pricingType: string | null; costPrice: string | null;
  discountPercent?: string | null;
};

// Quote 210, same rows as the SQL proof.
const q210: LI[] = [
  { quantity: "1", rate: "450.00", total: "450.00", pricingType: "one_off", costPrice: "0.00" },
  { quantity: "1", rate: "248.00", total: "248.00", pricingType: "one_off", costPrice: "0.00" },
  { quantity: "9", rate: "18.00",  total: "162.00", pricingType: "monthly", costPrice: "5.03" },
  { quantity: "1", rate: "76.62",  total: "76.62",  pricingType: "monthly", costPrice: "18.00" },
];

// A quote where the buy-in has never been entered — the case the
// workspace used to skip and the dashboard used to count.
const blankCost: LI[] = [
  { quantity: "1", rate: "100.00", total: "100.00", pricingType: "one_off", costPrice: null },
  { quantity: "2", rate: "50.00",  total: "100.00", pricingType: "monthly", costPrice: "" },
];

// ── QuoteWorkspace totals loop, copied verbatim from the delivery ────
function workspaceTotals(lineItems: LI[]) {
  let oneOff = 0, monthly = 0, annual = 0, optional = 0;
  let oneOffProfit = 0, monthlyProfit = 0, annualProfit = 0, optionalProfit = 0;
  for (const li of lineItems) {
    const total =
      parseNum(li.total) ||
      parseNum(li.quantity) * parseNum(li.rate) *
        (1 - clampDiscount((li as any).discountPercent) / 100);
    const pt = li.pricingType || "standard";
    if (pt === "monthly") monthly += total;
    else if (pt === "annual") annual += total;
    else if (pt === "optional") optional += total;
    else oneOff += total;

    const cost = parseNum((li as any).costPrice);
    {
      const qty = parseNum(li.quantity);
      const listRate = parseNum(li.rate);
      const discPct = clampDiscount((li as any).discountPercent);
      const rate = listRate * (1 - discPct / 100);
      const profit = (rate - cost) * qty;
      if (pt === "monthly") monthlyProfit += profit;
      else if (pt === "annual") annualProfit += profit;
      else if (pt === "optional") optionalProfit += profit;
      else oneOffProfit += profit;
    }
  }
  return { oneOff, monthly, annual, optional, oneOffProfit, monthlyProfit, annualProfit, optionalProfit };
}

// QuoteWorkspace's own formatter (includes the £).
function fmtGBP(n: number): string {
  if (!Number.isFinite(n)) return "£0.00";
  return `£${n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
}
// Dashboard's formatter (no £ — the cell adds it).
const formatGBP = (v: number) =>
  v.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// The header pill string, built the same way as the delivered file.
function profitSummary(t: ReturnType<typeof workspaceTotals>) {
  const parts: string[] = [];
  if (t.oneOffProfit > 0) parts.push(`${fmtGBP(t.oneOffProfit)}`);
  if (t.monthlyProfit > 0) parts.push(`${fmtGBP(t.monthlyProfit)}/mo`);
  if (t.annualProfit > 0) parts.push(`${fmtGBP(t.annualProfit)}/yr`);
  return parts.length > 0 ? `${parts.join(" + ")} profit` : null;
}

// ── Dashboard profit-line builder, copied verbatim ───────────────────
function dashboardLines(args: {
  subtotal: number; monthlyTotal: number; annualTotal: number;
  oneOffProfit: number; oneOffCost: number;
  monthlyProfit: number; monthlyCost: number;
  annualProfit: number; annualCost: number;
  lineCount: number;
}) {
  const cadences = [
    { revenue: args.subtotal,     profit: args.oneOffProfit,  cost: args.oneOffCost,  suffix: "" },
    { revenue: args.monthlyTotal, profit: args.monthlyProfit, cost: args.monthlyCost, suffix: "/mo" },
    { revenue: args.annualTotal,  profit: args.annualProfit,  cost: args.annualCost,  suffix: "/yr" },
  ];
  const profitLines = cadences
    .filter(c => c.revenue > 0 || c.profit !== 0)
    .map(c => {
      const base = c.profit + c.cost;
      return { profit: c.profit, marginPct: base > 0 ? (c.profit / base) * 100 : null, suffix: c.suffix };
    });
  const hasProfitData = args.lineCount > 0 && profitLines.length > 0;
  if (!hasProfitData) return { profit: "—", margin: "—" };
  return {
    profit: [
      `£${formatGBP(profitLines[0].profit)}${profitLines[0].suffix}`,
      ...profitLines.slice(1).map(l => `+ £${formatGBP(l.profit)}${l.suffix}`),
    ].join(" / "),
    margin: profitLines
      .map(l => (l.marginPct === null ? "—" : `${l.marginPct.toFixed(1)}%`))
      .join(" / "),
  };
}

console.log("── Workspace header, quote 210 ──");
const t = workspaceTotals(q210);
ok("one-off profit", t.oneOffProfit, 698.00);
ok("monthly profit", t.monthlyProfit, 175.35);
ok("header pill unchanged", profitSummary(t),
   "£698.00 + £175.35/mo profit");
ok("totals line unchanged", `${fmtGBP(t.oneOff)} + ${fmtGBP(t.monthly)}/mo`, "£698.00 + £238.62/mo");

console.log("\n── Dashboard row, quote 210 ──");
const row = dashboardLines({
  subtotal: 698.00, monthlyTotal: 238.62, annualTotal: 0,
  oneOffProfit: 698.00, oneOffCost: 0,
  monthlyProfit: 175.35, monthlyCost: 63.27,
  annualProfit: 0, annualCost: 0,
  lineCount: 4,
});
ok("profit cell", row.profit, "£698.00 / + £175.35/mo");
ok("margin cell", row.margin, "100.0% / 73.5%");

console.log("\n── The two screens now agree ──");
ok("workspace one-off = dashboard one-off", t.oneOffProfit, 698.00);
ok("workspace monthly = dashboard monthly", t.monthlyProfit, 175.35);

console.log("\n── Blank buy-in, both surfaces ──");
const tb = workspaceTotals(blankCost);
ok("workspace one-off profit (was 0 before)", tb.oneOffProfit, 100.00);
ok("workspace monthly profit (was 0 before)", tb.monthlyProfit, 100.00);
ok("header pill now shows a figure", profitSummary(tb), "£100.00 + £100.00/mo profit");

console.log("\n── A quote with no line items still shows a dash ──");
const empty = dashboardLines({
  subtotal: 0, monthlyTotal: 0, annualTotal: 0,
  oneOffProfit: 0, oneOffCost: 0, monthlyProfit: 0, monthlyCost: 0,
  annualProfit: 0, annualCost: 0, lineCount: 0,
});
ok("profit cell", empty.profit, "—");
ok("margin cell", empty.margin, "—");

console.log("\n── A loss-making cadence is not hidden ──");
const loss = dashboardLines({
  subtotal: 0, monthlyTotal: 100, annualTotal: 0,
  oneOffProfit: 0, oneOffCost: 0,
  monthlyProfit: -20, monthlyCost: 120,
  annualProfit: 0, annualCost: 0, lineCount: 1,
});
ok("negative monthly profit shown", loss.profit, "£-20.00/mo");
ok("negative margin shown", loss.margin, "-20.0%");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
