/**
 * Pest Control — Demo Quote Factory
 *
 * Returns a canonical "(Example)" quote for a food-premises pest control
 * engagement: BRC/CIEH-compliant monthly contract for a restaurant,
 * 6 electronic rodent monitoring units, and a one-off proofing survey
 * plus remedial works — the typical takeover shape for a food-sector
 * site with documented audit requirements.
 *
 * Every line-item `name` here matches an entry in
 * `PEST_CONTROL_CATALOG_SEED` byte-for-byte. See the IT demo for the
 * full factory-contract rationale; this file follows the same shape.
 */

import type { DemoQuoteFactory, DemoQuoteBundle } from "./index";

const CLIENT_NAME = "The Millhouse Kitchen";
const CONTACT_NAME = "David Ellis";

export const getDemoQuote: DemoQuoteFactory = (): DemoQuoteBundle => {
  const today = new Date();
  const todayUK = today.toLocaleDateString("en-GB");
  const validUntil = new Date(today);
  validUntil.setDate(validUntil.getDate() + 30);

  const mul = (qty: number, rate: number) => (qty * rate).toFixed(2);

  const lineItems: DemoQuoteBundle["lineItems"] = [
    {
      description:
        "Food Premises Pest Control Contract — Restaurant / Café — Commercial pest control contract for restaurants, cafés, and commercial kitchens || 8 scheduled visits per year (every 6 weeks) || Rodent, crawling insect, and flying insect monitoring || EFK (electric fly killer) servicing and lamp changes || Full BRC / CIEH-compliant documentation pack || Call-back visits included within contract term || Technician trained in food-sector environments || Minimum 12-month contract || Monthly figure shown — billed quarterly in arrears",
      quantity: "1.0000",
      unit: "Month",
      rate: "95.00",
      total: mul(1, 95.0),
      pricingType: "monthly",
      category: "Commercial Pest Control Contracts",
      costPrice: null,
    },
    {
      description:
        "Electronic Rodent Monitoring — Monthly — Electronic rodent monitoring system per unit || 24/7 remote monitoring with instant alerts to site manager and technician || Near-zero chemical use (IPM / non-toxic approach) || Automatic activity logging for compliance || 6 units across kitchen, stores, bin area, and back-of-house",
      quantity: "6.0000",
      unit: "Unit",
      rate: "12.50",
      total: mul(6, 12.5),
      pricingType: "monthly",
      category: "Monitoring Systems",
      costPrice: "6.00",
    },
    {
      description:
        "Rodent Proofing Survey — Full rodent proofing survey of the commercial premises || Inspection of all potential entry points (gaps, vents, roof, drains) || Detailed written report with prioritised recommendations || Photographic evidence of findings || Quotation for remedial works included inline below",
      quantity: "1.0000",
      unit: "Survey",
      rate: "145.00",
      total: mul(1, 145.0),
      pricingType: "standard",
      category: "Proofing & Exclusion",
      costPrice: null,
    },
    {
      description:
        "Rodent Proofing Works — Per Hour — Remedial proofing works identified by the survey || Sealing of gaps with wire mesh, steel wool, mortar, or sealant || Fitting of door sweeps and vent covers || Drain cap and rodent flap fitting || Materials included for this scope of works",
      quantity: "3.0000",
      unit: "Hour",
      rate: "65.00",
      total: mul(3, 65.0),
      pricingType: "standard",
      category: "Proofing & Exclusion",
      costPrice: null,
    },
    {
      description:
        "Initial Site Survey — Initial site survey for the commercial pest control proposal || Full site walk-round and inspection || Pest activity assessment and risk rating || Written proposal with recommended service schedule and pricing || Waived if the contract is signed within 30 days of this quote",
      quantity: "1.0000",
      unit: "Survey",
      rate: "125.00",
      total: mul(1, 125.0),
      pricingType: "standard",
      category: "Labour & Callouts",
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
      `Example food-premises pest control takeover — ${CLIENT_NAME}. BRC/CIEH-compliant 8-visit annual contract for a restaurant kitchen, supplemented by 6 electronic rodent monitoring units for IPM coverage of high-risk zones. Includes a one-off rodent proofing survey and 3 hours of remedial proofing works, plus an initial site survey (waived if the contract is signed within 30 days). Installed hardware ownership to be confirmed with incumbent provider on takeover.`,
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
      "This is an example quote auto-seeded to show you what a finished food-premises pest contract looks like. Edit or delete anytime — nothing here affects your real quotes.",
  });

  const quoteFields: DemoQuoteBundle["quoteFields"] = {
    reference: `EXAMPLE-PST-${today.getTime()}`,
    status: "draft",
    quoteMode: "simple",
    tradePreset: "pest_control",
    title: `(Example) — Food Premises Contract & Proofing — ${CLIENT_NAME}`,
    description: `Food-sector pest control proposal for ${CLIENT_NAME} — BRC/CIEH-compliant monthly contract covering 8 visits per year, supplemented with 6 electronic rodent monitoring units for continuous IPM coverage. One-off proofing survey plus 3 hours of remedial works addresses entry points identified on initial inspection. Site survey waived if contract signed within 30 days. Quote dated ${todayUK}.`,
    clientName: CLIENT_NAME,
    contactName: CONTACT_NAME,
    clientEmail: "david@example-millhouse-kitchen.co.uk",
    clientPhone: "01865 555 712",
    clientAddress: "The Millhouse\n42 High Street\nAbingdon\nOX14 5AE",
    validUntil,
  };

  return { quoteFields, qdsSummaryJson, lineItems };
};
