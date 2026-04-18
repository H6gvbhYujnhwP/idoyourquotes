/**
 * Commercial Cleaning — Demo Quote Factory
 *
 * Returns a canonical "(Example)" quote for a mid-size office cleaning
 * contract: daily evening clean of a ~4,500 sq ft office, washroom
 * servicing across 4 washrooms, monthly consumables, and a one-off deep
 * clean on contract start.
 *
 * Every line-item `name` here matches an entry in
 * `COMMERCIAL_CLEANING_CATALOG_SEED` byte-for-byte. See the IT demo for
 * the full factory-contract rationale; this file follows the same shape.
 */

import type { DemoQuoteFactory, DemoQuoteBundle } from "./index";

const CLIENT_NAME = "Oakhaven Solicitors LLP";
const CONTACT_NAME = "Rachel Dhaliwal";

export const getDemoQuote: DemoQuoteFactory = (): DemoQuoteBundle => {
  const today = new Date();
  const todayUK = today.toLocaleDateString("en-GB");
  const validUntil = new Date(today);
  validUntil.setDate(validUntil.getDate() + 30);

  const mul = (qty: number, rate: number) => (qty * rate).toFixed(2);

  const lineItems: DemoQuoteBundle["lineItems"] = [
    {
      description:
        "Daily Office Cleaning — Medium Site (2,000–10,000 sq ft) — Recurring office cleaning contract for medium sites || Monday–Friday evening cleans (or morning, as agreed) || Full office, kitchen, and washroom cleaning || Periodic touch-points included (door handles, switches, shared surfaces) || Cleaning materials supplied; consumables restock included || Fortnightly supervisor site visit with quality audit || Minimum 12-month contract",
      quantity: "1.0000",
      unit: "Month",
      rate: "1250.00",
      total: mul(1, 1250.0),
      pricingType: "monthly",
      category: "Recurring Cleaning Contracts",
      costPrice: null,
    },
    {
      description:
        "Washroom Services Contract — Monthly washroom services and hygiene contract || Sanitary bin servicing (typically monthly, frequency variable) || Nappy bin servicing where applicable || Air freshener units supplied and serviced || Urinal sanitiser dosing units || Certificate of waste transfer provided || Priced per washroom — 4 washrooms on site",
      quantity: "4.0000",
      unit: "Washroom",
      rate: "18.00",
      total: mul(4, 18.0),
      pricingType: "monthly",
      category: "Washroom & Consumables",
      costPrice: null,
    },
    {
      description:
        "Consumables — Monthly Supply Contract — Monthly supply of washroom and kitchen consumables || Toilet rolls, hand towels, hand soap || Kitchen cleaning products and dishwasher tablets || Delivery included; dispensers supplied on loan || Priced for a medium office (~30 users)",
      quantity: "1.0000",
      unit: "Month",
      rate: "95.00",
      total: mul(1, 95.0),
      pricingType: "monthly",
      category: "Washroom & Consumables",
      costPrice: "55.00",
    },
    {
      description:
        "Deep Clean — Office (per sq ft) — One-off contract-start deep clean || Full kitchen and washroom deep clean || Upholstery vacuum and spot treatment || Hard floor strip, clean, and seal / polish || High-level dusting (vents, light fittings, tops of cabinets) || Interior window clean || Priced per square foot across 4,500 sq ft footprint",
      quantity: "4500.0000",
      unit: "Sq ft",
      rate: "0.35",
      total: mul(4500, 0.35),
      pricingType: "standard",
      category: "Periodic Deep Cleans",
      costPrice: null,
    },
  ];

  const materials = lineItems.map((li) => {
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
      `Example office cleaning contract — ${CLIENT_NAME}. Daily Mon–Fri evening clean of a 4,500 sq ft office across 4 washrooms, plus monthly washroom services and consumables supply, and a one-off contract-start deep clean. Recurring work billed monthly; deep clean as a one-off on commencement.`,
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
      "This is an example quote auto-seeded to show you what a finished office-cleaning contract looks like. Edit or delete anytime — nothing here affects your real quotes.",
  });

  const quoteFields: DemoQuoteBundle["quoteFields"] = {
    reference: `EXAMPLE-CLN-${today.getTime()}`,
    status: "draft",
    quoteMode: "simple",
    tradePreset: "commercial_cleaning",
    title: `(Example) — Daily Office Clean & Washrooms — ${CLIENT_NAME}`,
    description: `Daily evening cleaning contract for ${CLIENT_NAME} — 4,500 sq ft office across 2 floors with 4 washrooms. Contract covers Monday–Friday evening cleans, monthly washroom services, monthly consumables supply, and a one-off contract-start deep clean. 12-month minimum term. Quote dated ${todayUK}.`,
    clientName: CLIENT_NAME,
    contactName: CONTACT_NAME,
    clientEmail: "r.dhaliwal@example-oakhaven-law.co.uk",
    clientPhone: "0121 555 0198",
    clientAddress: "3rd Floor, Oakhaven House\n27 Colmore Row\nBirmingham\nB3 2BS",
    validUntil,
  };

  return { quoteFields, qdsSummaryJson, lineItems };
};
