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

import type { DemoQuoteFactory, DemoQuoteBundle, CoreDemoLineItem } from "./index";
import { enrichDemoLineItem } from "./index";

const CLIENT_NAME = "The Millhouse Kitchen";
const CONTACT_NAME = "David Ellis";

export const getDemoQuote: DemoQuoteFactory = (): DemoQuoteBundle => {
  const today = new Date();
  const todayUK = today.toLocaleDateString("en-GB");
  const validUntil = new Date(today);
  validUntil.setDate(validUntil.getDate() + 30);

  const mul = (qty: number, rate: number) => (qty * rate).toFixed(2);

  const coreLineItems: CoreDemoLineItem[] = [
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
      pricingType: "one_off",
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
      pricingType: "one_off",
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
      pricingType: "one_off",
      category: "Labour & Callouts",
      costPrice: null,
    },
  ];

  // Beta-2 provenance is uniform across demo rows — enrich in one pass.
  const lineItems: DemoQuoteBundle["lineItems"] = coreLineItems.map(enrichDemoLineItem);

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

  return { quoteFields, lineItems };
};
