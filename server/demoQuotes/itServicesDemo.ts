/**
 * IT Services / MSP — Demo Quote Factory
 *
 * Returns a canonical "(Example)" quote that demonstrates what a finished
 * MSP quote looks like — a takeover / onboarding for a 20-user professional
 * services firm with the typical Microsoft 365 + security + backup + support
 * stack and a one-off engineer-onsite line for setup.
 *
 * Every line-item `name` here matches an entry in `IT_SERVICES_CATALOG_SEED`
 * byte-for-byte so that — if the user has seeded their catalog — the
 * catalog-match fuzzy lookup in QuoteWorkspace resolves cleanly to real
 * catalog rates and cost prices. If the catalog isn't seeded yet, the
 * `rate` / `costPrice` fields here are the fallback so the demo still
 * renders fully populated totals out of the box.
 *
 * Factory contract:
 *   - Returns plain-data fields only — no database access, no side effects.
 *   - `quoteFields` goes straight into createQuote() in db.ts.
 *   - `qdsSummaryJson` goes straight into updateQuote() after createQuote
 *     (createQuote doesn't set that column). Shape matches exactly what
 *     `triggerVoiceAnalysis` writes, so future rehydration would restore
 *     cleanly. Note: demo quotes have no inputs, so the QuoteWorkspace
 *     rehydration useEffect bails on the `inputs.length === 0` guard and
 *     the QDS tab stays empty — acceptable, the Quote tab is the payoff.
 *   - `lineItems` each carry pre-computed `total = quantity × rate` as a
 *     decimal-string (recalculateQuoteTotals reads `total`, doesn't
 *     recompute rows).
 *
 * All prices are EXCLUSIVE of VAT (matches the rest of the app — VAT is
 * added by Stripe on billing, or by recalculateQuoteTotals for quote
 * display). Status is always "draft".
 */

import type { DemoQuoteFactory, DemoQuoteBundle } from "./index";

const CLIENT_NAME = "Northfield Surveyors Ltd";
const CONTACT_NAME = "Sarah Mitchell";

export const getDemoQuote: DemoQuoteFactory = (): DemoQuoteBundle => {
  const today = new Date();
  const todayUK = today.toLocaleDateString("en-GB");
  const validUntil = new Date(today);
  validUntil.setDate(validUntil.getDate() + 30);

  // Helper: multiply two decimals, return as string to 2dp
  const mul = (qty: number, rate: number) => (qty * rate).toFixed(2);

  const lineItems: DemoQuoteBundle["lineItems"] = [
    {
      description:
        "Microsoft 365 Business Standard — Annual — Microsoft 365 Business Standard [NCE / 1-Year term, billed monthly — best value] || Full desktop Office apps (Word, Excel, PowerPoint, Outlook) || Exchange Online mailbox (50GB) || Teams, OneDrive (1TB), SharePoint || Installs on up to 5 PCs/Macs and 5 mobile devices per user",
      quantity: "20.0000",
      unit: "User",
      rate: "10.08",
      total: mul(20, 10.08),
      pricingType: "monthly",
      category: "Microsoft 365 & Licensing",
      costPrice: "8.57",
    },
    {
      description:
        "ESET Endpoint Protection — Business-grade endpoint security per device || Real-time anti-malware and anti-phishing || Exploit blocker and ransomware shield || Web filtering and device control || Centralised cloud management console",
      quantity: "20.0000",
      unit: "Device",
      rate: "4.00",
      total: mul(20, 4.0),
      pricingType: "monthly",
      category: "Security & Backup",
      costPrice: "0.67",
    },
    {
      description:
        "SaaS Protect Backup (Microsoft 365 Backup) — Cloud-to-cloud backup for Microsoft 365 data || 3× daily automated backups of Exchange, OneDrive, SharePoint, Teams || Unlimited retention with point-in-time restore || Granular restore at item, folder, or mailbox level || Ransomware and accidental-deletion protection",
      quantity: "20.0000",
      unit: "User",
      rate: "4.00",
      total: mul(20, 4.0),
      pricingType: "monthly",
      category: "Security & Backup",
      costPrice: "1.40",
    },
    {
      description:
        "Advanced Email Protection (E-Mail Protect) — Advanced email threat protection per mailbox || Anti-phishing and impersonation detection || URL rewriting and time-of-click analysis || Attachment sandboxing || Business email compromise (BEC) protection",
      quantity: "20.0000",
      unit: "User",
      rate: "2.00",
      total: mul(20, 2.0),
      pricingType: "monthly",
      category: "Security & Backup",
      costPrice: "1.15",
    },
    {
      description:
        "Silver IT Support — Unlimited Remote — Managed IT support contract per named user || Unlimited remote helpdesk during business hours (Mon–Fri 9–5) || Ticket-based support with 4-hour response SLA || Remote desktop assistance and troubleshooting || Software and application support || Monthly usage reporting",
      quantity: "20.0000",
      unit: "User",
      rate: "18.00",
      total: mul(20, 18.0),
      pricingType: "monthly",
      category: "IT Support Contracts",
      costPrice: null,
    },
    {
      description:
        "Engineer — Onsite — Onboarding and initial setup || Site walk-round and device audit || User account provisioning and M365 tenancy setup || Endpoint protection rollout and backup verification || User handover and training session || Scheduled across 1 onsite day",
      quantity: "4.0000",
      unit: "Hour",
      rate: "99.00",
      total: mul(4, 99.0),
      pricingType: "standard",
      category: "Engineer Labour",
      costPrice: null,
    },
  ];

  // Materials inside qdsSummaryJson mirror the line items but in the QDS
  // MaterialItem shape. source: "voice" because that's the source value
  // the rehydration useEffect would restore with.
  const materials = lineItems.map((li) => {
    // Split "{item} — {description}" to recover item name
    const [item, ...rest] = li.description.split(" — ");
    const description = rest.join(" — ");
    return {
      item,
      quantity: parseFloat(li.quantity),
      unitPrice: parseFloat(li.rate),
      costPrice: li.costPrice !== null ? parseFloat(li.costPrice) : null,
      installTimeHrs: null as number | null,
      labourCost: null as number | null,
      unit: li.unit,
      description,
      pricingType: li.pricingType,
      estimated: false,
      source: "voice" as const,
      catalogName: item,
    };
  });

  const qdsSummaryJson = JSON.stringify({
    clientName: CLIENT_NAME,
    jobDescription:
      `Example IT takeover — ${CLIENT_NAME} (20 users). Migration from incumbent provider covering Microsoft 365 licensing, endpoint security, M365 backup, email protection, and ongoing managed support, plus a one-off onsite engineer day for onboarding. Billed monthly per user; onboarding billed as a one-off.`,
    labour: [],
    materials,
    plantHire: [],
    markup: null,
    sundries: null,
    contingency: null,
    preliminaries: null,
    labourRate: null,
    plantMarkup: null,
    notes:
      "This is an example quote auto-seeded to show you what a finished IT takeover looks like. Edit or delete anytime — nothing here affects your real quotes.",
  });

  const quoteFields: DemoQuoteBundle["quoteFields"] = {
    reference: `EXAMPLE-IT-${today.getTime()}`,
    status: "draft",
    quoteMode: "simple",
    tradePreset: "it_services",
    title: `(Example) — Managed IT for 20 Users — ${CLIENT_NAME}`,
    description: `Managed IT services takeover for ${CLIENT_NAME} — 20 users across one site. Monthly recurring stack covers Microsoft 365 licensing, endpoint protection, M365 backup, email security, and unlimited remote support. One-off onsite day covers tenancy migration and user handover. Quote dated ${todayUK}.`,
    clientName: CLIENT_NAME,
    contactName: CONTACT_NAME,
    clientEmail: "sarah.mitchell@example-northfield.co.uk",
    clientPhone: "01234 567 890",
    clientAddress: "14 Market Square\nNorthfield\nB31 2XX",
    validUntil,
  };

  return { quoteFields, qdsSummaryJson, lineItems };
};
