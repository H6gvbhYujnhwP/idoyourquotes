/**
 * Pest Control — Starter Catalog Seed
 *
 * 24 items covering the common offering for a UK pest control firm serving
 * both commercial (offices, food premises, healthcare, warehouses) and
 * residential clients: recurring commercial contracts, one-off treatments,
 * proofing works, monitoring systems, and labour rates.
 *
 * Prices are UK mid-market reference points — every firm that signs up will
 * edit these to match their own operating costs, BPCA membership status,
 * sector mix, and regional rates.
 *
 * Fired by:
 *   - server/db.ts createUser() — automatic on new Pest Control sector
 *     registration
 *   - server/routers.ts catalog.seedFromSectorTemplate — manual button in UI
 *
 * All prices are EXCLUSIVE of VAT. Recurring contracts use pricingType
 * "monthly" — the price shown is the monthly retainer, regardless of visit
 * cadence. A quarterly-serviced food-premises contract still reads as a
 * monthly figure here (the average monthly cost), with the visit schedule
 * and commitment term in the description.
 *
 * Naming convention follows how UK pest control firms label their services
 * on their rate cards so AI extraction from incumbent-provider invoices
 * matches cleanly. Typical incumbent invoices read "Quarterly servicing —
 * commercial contract" or "One-off wasp nest removal" — our catalog names
 * mirror that language.
 */

import type { CatalogSeedItem } from "./itServicesSeed";

export const PEST_CONTROL_CATALOG_SEED: readonly CatalogSeedItem[] = [
  // ───────── Commercial Pest Control Contracts (5) ─────────
  {
    name: "Office / Retail Pest Control Contract",
    description: "Commercial pest control contract for office and retail premises\nQuarterly preventative visits (4 per year)\nRodent and crawling insect monitoring stations installed and serviced\nPest activity reporting and trend logs\nCall-back visits included within contract term\nDocumentation suitable for health & safety audits\nMinimum 12-month contract\nMonthly figure shown is average — billed quarterly in arrears",
    category: "Commercial Pest Control Contracts",
    unit: "Month",
    pricingType: "monthly",
    defaultRate: "45.00",
    costPrice: null,
  },
  {
    name: "Food Premises Pest Control Contract — Restaurant / Café",
    description: "Commercial pest control contract for restaurants, cafés, and commercial kitchens\n8 scheduled visits per year (every 6 weeks)\nRodent, crawling insect, and flying insect monitoring\nEFK (electric fly killer) servicing and lamp changes\nFull BRC / CIEH-compliant documentation pack\nCall-back visits included within contract term\nTechnician trained in food-sector environments\nMinimum 12-month contract\nMonthly figure shown is average — billed quarterly in arrears",
    category: "Commercial Pest Control Contracts",
    unit: "Month",
    pricingType: "monthly",
    defaultRate: "95.00",
    costPrice: null,
  },
  {
    name: "Food Manufacturing / Warehouse Contract",
    description: "Enhanced commercial pest control contract for food production and storage sites\nMonthly or fortnightly scheduled visits (as agreed)\nComprehensive rodent, crawling insect, flying insect monitoring and control\nBird monitoring where relevant\nFull BRC, SALSA, or CIEH-compliant documentation and audit support\nPest proofing audits and recommendations\nUnlimited call-backs included\nMinimum 12-month contract\nMonthly figure shown is average — scales by site footprint and risk rating",
    category: "Commercial Pest Control Contracts",
    unit: "Month",
    pricingType: "monthly",
    defaultRate: "285.00",
    costPrice: null,
  },
  {
    name: "Healthcare / Pharmacy Pest Control Contract",
    description: "Commercial pest control contract for healthcare and pharmacy premises\nQuarterly scheduled visits\nRodent and crawling insect monitoring to healthcare-compliant standard\nIPM (Integrated Pest Management) approach — minimal chemical use\nDocumentation suitable for CQC and MHRA audits\nTechnician trained in healthcare environments\nCall-back visits included\nMinimum 12-month contract",
    category: "Commercial Pest Control Contracts",
    unit: "Month",
    pricingType: "monthly",
    defaultRate: "85.00",
    costPrice: null,
  },
  {
    name: "Schools / Nurseries Pest Control Contract",
    description: "Commercial pest control contract for educational premises\nTermly or quarterly scheduled visits timed outside pupil hours\nChild-safe IPM approach (tamper-resistant bait stations, minimal chemical use)\nDBS-checked technicians\nDocumentation for Ofsted and local authority audits\nCall-back visits included\nMinimum 12-month contract",
    category: "Commercial Pest Control Contracts",
    unit: "Month",
    pricingType: "monthly",
    defaultRate: "65.00",
    costPrice: null,
  },

  // ───────── One-Off Treatments — Domestic (7) ─────────
  {
    name: "Wasp / Hornet Nest Removal",
    description: "One-off wasp or hornet nest treatment\nSame-day or next-day callout in season (Apr–Oct)\nSafe chemical destruction of active nest\nPPE and specialist access equipment as required\nDead nest removal on follow-up where accessible\nGuaranteed result — free re-treatment if nest reactivates",
    category: "One-Off Treatments — Domestic",
    unit: "Treatment",
    pricingType: "standard",
    defaultRate: "85.00",
    costPrice: null,
  },
  {
    name: "Rat Treatment — Residential",
    description: "Residential rat treatment programme\nInitial site survey and entry-point identification\nBaiting programme with tamper-resistant stations\n2–3 follow-up visits included to achieve clearance\nProofing advice and quote for remedial works\n90-day guarantee on treatment",
    category: "One-Off Treatments — Domestic",
    unit: "Treatment",
    pricingType: "standard",
    defaultRate: "195.00",
    costPrice: null,
  },
  {
    name: "Mouse Treatment — Residential",
    description: "Residential mouse treatment programme\nInitial site survey and entry-point identification\nBaiting programme with tamper-resistant stations\n2 follow-up visits included to achieve clearance\nProofing advice\n60-day guarantee on treatment",
    category: "One-Off Treatments — Domestic",
    unit: "Treatment",
    pricingType: "standard",
    defaultRate: "135.00",
    costPrice: null,
  },
  {
    name: "Bed Bug Treatment — Chemical",
    description: "Bed bug chemical treatment for residential property\nInitial inspection and infestation assessment\nTwo chemical treatment visits (initial + follow-up)\nResidual insecticide treatment of mattresses, furniture, skirting, flooring\nGuidance on pre- and post-treatment preparation\n30-day guarantee\nTreatment per room — price shown is anchor figure for a 1-bedroom property",
    category: "One-Off Treatments — Domestic",
    unit: "Property",
    pricingType: "standard",
    defaultRate: "325.00",
    costPrice: null,
  },
  {
    name: "Cockroach Treatment — Residential",
    description: "Residential cockroach treatment programme\nSpecies identification (German vs Oriental)\nGel baiting and residual insecticide treatment\n2–3 follow-up visits included to achieve clearance\nMonitoring stations left in place post-treatment\n60-day guarantee",
    category: "One-Off Treatments — Domestic",
    unit: "Treatment",
    pricingType: "standard",
    defaultRate: "225.00",
    costPrice: null,
  },
  {
    name: "Flea Treatment — Residential",
    description: "Residential flea treatment (whole property)\nThorough property inspection\nFull residual spray treatment of all carpeted and soft-furnished areas\nGuidance on pre- and post-treatment preparation (vacuum, pet treatment)\nSingle-visit treatment with 30-day guarantee\nFollow-up visit available at reduced rate if required",
    category: "One-Off Treatments — Domestic",
    unit: "Property",
    pricingType: "standard",
    defaultRate: "145.00",
    costPrice: null,
  },
  {
    name: "Ant Treatment — Residential",
    description: "Residential ant treatment\nSpecies identification (garden, pharaoh, ghost)\nGel bait or residual spray treatment as appropriate\nTreatment of entry points and trails\nSingle visit for garden ants; programme for pharaoh ants\n30-day guarantee on garden ant treatment",
    category: "One-Off Treatments — Domestic",
    unit: "Treatment",
    pricingType: "standard",
    defaultRate: "95.00",
    costPrice: null,
  },

  // ───────── One-Off Treatments — Commercial (2) ─────────
  {
    name: "Commercial Rodent Clear-Out",
    description: "One-off rodent clear-out for commercial premises\nComprehensive site survey and entry-point mapping\nBaiting programme with appropriate bait stations for the sector (food-safe where required)\n3–4 follow-up visits to achieve clearance\nFull documentation and treatment log\nProofing quote provided\nAnchor price for medium commercial premises — scales with site size",
    category: "One-Off Treatments — Commercial",
    unit: "Treatment",
    pricingType: "standard",
    defaultRate: "485.00",
    costPrice: null,
  },
  {
    name: "Commercial Crawling / Flying Insect Treatment",
    description: "One-off commercial insect treatment\nSpecies identification and site survey\nULV fogging, residual spray, or gel bait as appropriate\nSuitable for flies, cockroaches, beetles, or other crawling/flying insects\nOut-of-hours treatment available at supplement\nDocumentation for health & safety / food audit trail",
    category: "One-Off Treatments — Commercial",
    unit: "Treatment",
    pricingType: "standard",
    defaultRate: "395.00",
    costPrice: null,
  },

  // ───────── Proofing & Exclusion (3) ─────────
  {
    name: "Rodent Proofing Survey",
    description: "Full rodent proofing survey of a commercial or residential property\nInspection of all potential entry points (gaps, vents, roof, drains)\nDetailed written report with prioritised recommendations\nPhotographic evidence of findings\nQuotation for remedial works provided separately",
    category: "Proofing & Exclusion",
    unit: "Survey",
    pricingType: "standard",
    defaultRate: "145.00",
    costPrice: null,
  },
  {
    name: "Rodent Proofing Works — Per Hour",
    description: "Rodent proofing remedial works, hourly rate\nSealing of gaps with wire mesh, steel wool, mortar, or sealant\nFitting of door sweeps and vent covers\nDrain cap and rodent flap fitting\nMaterials typically charged separately at cost + markup",
    category: "Proofing & Exclusion",
    unit: "Hour",
    pricingType: "standard",
    defaultRate: "65.00",
    costPrice: null,
  },
  {
    name: "Bird Proofing — Netting or Spikes (per sq m)",
    description: "Bird proofing works per square metre\nPigeon and gull netting or spike systems\nSurvey and proposal included\nWorks at height via ladder or access platform (platform hire quoted separately if required)\n5-year product warranty on spikes; 3-year on netting\nHumane, non-lethal exclusion only",
    category: "Proofing & Exclusion",
    unit: "Sq m",
    pricingType: "standard",
    defaultRate: "45.00",
    costPrice: null,
  },

  // ───────── Monitoring Systems (2) ─────────
  {
    name: "Electronic Rodent Monitoring — Monthly",
    description: "Electronic rodent monitoring system per unit\n24/7 remote monitoring with instant alerts to site manager and technician\nNear-zero chemical use (IPM / non-toxic approach)\nAutomatic activity logging for compliance\nSuitable for high-risk or food-production environments\nMonthly monitoring fee per unit — hardware priced separately",
    category: "Monitoring Systems",
    unit: "Unit",
    pricingType: "monthly",
    defaultRate: "12.50",
    costPrice: "6.00",
  },
  {
    name: "Electric Fly Killer — Supply & Install",
    description: "Electric fly killer (EFK) supply and installation\nCommercial-grade unit suitable for food premises\nFitted at optimal position (height and location) by trained technician\nIncludes initial UV tubes and sticky boards\nAnnual servicing contract available separately\nAnchor price for standard 30W unit",
    category: "Monitoring Systems",
    unit: "Unit",
    pricingType: "standard",
    defaultRate: "245.00",
    costPrice: "95.00",
  },

  // ───────── Labour & Callouts (5) ─────────
  {
    name: "Pest Control Technician — Hourly",
    description: "BPCA-qualified pest control technician hourly rate\nMinimum 1-hour charge\nTreatment chemicals and standard bait stations included\nSpecialist materials (e.g. heat treatment equipment, large-scale fogging) quoted separately\nStandard weekday working hours",
    category: "Labour & Callouts",
    unit: "Hour",
    pricingType: "standard",
    defaultRate: "75.00",
    costPrice: null,
  },
  {
    name: "Senior / BPCA Advanced Technician — Hourly",
    description: "BPCA Advanced Technician or consultant hourly rate\nUsed for complex cases, audits, and compliance work\nMinimum 1-hour charge\nStandard weekday working hours\nSpecialist for bed bug heat treatments, BRC audit support, and training",
    category: "Labour & Callouts",
    unit: "Hour",
    pricingType: "standard",
    defaultRate: "95.00",
    costPrice: null,
  },
  {
    name: "Emergency / Out-of-Hours Callout",
    description: "Emergency pest control callout outside standard working hours\nEvenings (after 18:00), weekends, and bank holidays\nMinimum 2-hour charge\nTypical scenarios: active wasp nest at an event, infestation discovered during a health audit, rodent emergency in food premises\nStandard treatments chargeable in addition to callout rate",
    category: "Labour & Callouts",
    unit: "Hour",
    pricingType: "standard",
    defaultRate: "125.00",
    costPrice: null,
  },
  {
    name: "Initial Site Survey",
    description: "Initial site survey for commercial pest control proposal\nFull site walk-round and inspection\nPest activity assessment and risk rating\nWritten proposal with recommended service schedule and pricing\nTypically waived if a contract is signed within 30 days\nPrice shown is paid-survey rate",
    category: "Labour & Callouts",
    unit: "Survey",
    pricingType: "standard",
    defaultRate: "125.00",
    costPrice: null,
  },
  {
    name: "Mileage / Travel Charge",
    description: "Travel charge beyond standard service area\nApplied per mile beyond agreed service radius\nCovers technician time and vehicle costs\nStandard service radius (typically 20 miles) included at no charge on contract work",
    category: "Labour & Callouts",
    unit: "Mile",
    pricingType: "standard",
    defaultRate: "0.65",
    costPrice: null,
  },
] as const;
