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
    description: "Commercial pest control contract for office and retail premises || Quarterly preventative visits (4 per year) || Rodent and crawling insect monitoring stations installed and serviced || Pest activity reporting and trend logs || Call-back visits included within contract term || Documentation suitable for health & safety audits || Minimum 12-month contract || Monthly figure shown is average — billed quarterly in arrears",
    category: "Commercial Pest Control Contracts",
    unit: "Month",
    pricingType: "monthly",
    defaultRate: "45.00",
    costPrice: null,
  },
  {
    name: "Food Premises Pest Control Contract — Restaurant / Café",
    description: "Commercial pest control contract for restaurants, cafés, and commercial kitchens || 8 scheduled visits per year (every 6 weeks) || Rodent, crawling insect, and flying insect monitoring || EFK (electric fly killer) servicing and lamp changes || Full BRC / CIEH-compliant documentation pack || Call-back visits included within contract term || Technician trained in food-sector environments || Minimum 12-month contract || Monthly figure shown is average — billed quarterly in arrears",
    category: "Commercial Pest Control Contracts",
    unit: "Month",
    pricingType: "monthly",
    defaultRate: "95.00",
    costPrice: null,
  },
  {
    name: "Food Manufacturing / Warehouse Contract",
    description: "Enhanced commercial pest control contract for food production and storage sites || Monthly or fortnightly scheduled visits (as agreed) || Comprehensive rodent, crawling insect, flying insect monitoring and control || Bird monitoring where relevant || Full BRC, SALSA, or CIEH-compliant documentation and audit support || Pest proofing audits and recommendations || Unlimited call-backs included || Minimum 12-month contract || Monthly figure shown is average — scales by site footprint and risk rating",
    category: "Commercial Pest Control Contracts",
    unit: "Month",
    pricingType: "monthly",
    defaultRate: "285.00",
    costPrice: null,
  },
  {
    name: "Healthcare / Pharmacy Pest Control Contract",
    description: "Commercial pest control contract for healthcare and pharmacy premises || Quarterly scheduled visits || Rodent and crawling insect monitoring to healthcare-compliant standard || IPM (Integrated Pest Management) approach — minimal chemical use || Documentation suitable for CQC and MHRA audits || Technician trained in healthcare environments || Call-back visits included || Minimum 12-month contract",
    category: "Commercial Pest Control Contracts",
    unit: "Month",
    pricingType: "monthly",
    defaultRate: "85.00",
    costPrice: null,
  },
  {
    name: "Schools / Nurseries Pest Control Contract",
    description: "Commercial pest control contract for educational premises || Termly or quarterly scheduled visits timed outside pupil hours || Child-safe IPM approach (tamper-resistant bait stations, minimal chemical use) || DBS-checked technicians || Documentation for Ofsted and local authority audits || Call-back visits included || Minimum 12-month contract",
    category: "Commercial Pest Control Contracts",
    unit: "Month",
    pricingType: "monthly",
    defaultRate: "65.00",
    costPrice: null,
  },

  // ───────── One-Off Treatments — Domestic (7) ─────────
  {
    name: "Wasp / Hornet Nest Removal",
    description: "One-off wasp or hornet nest treatment || Same-day or next-day callout in season (Apr–Oct) || Safe chemical destruction of active nest || PPE and specialist access equipment as required || Dead nest removal on follow-up where accessible || Guaranteed result — free re-treatment if nest reactivates",
    category: "One-Off Treatments — Domestic",
    unit: "Treatment",
    pricingType: "standard",
    defaultRate: "85.00",
    costPrice: null,
  },
  {
    name: "Rat Treatment — Residential",
    description: "Residential rat treatment programme || Initial site survey and entry-point identification || Baiting programme with tamper-resistant stations || 2–3 follow-up visits included to achieve clearance || Proofing advice and quote for remedial works || 90-day guarantee on treatment",
    category: "One-Off Treatments — Domestic",
    unit: "Treatment",
    pricingType: "standard",
    defaultRate: "195.00",
    costPrice: null,
  },
  {
    name: "Mouse Treatment — Residential",
    description: "Residential mouse treatment programme || Initial site survey and entry-point identification || Baiting programme with tamper-resistant stations || 2 follow-up visits included to achieve clearance || Proofing advice || 60-day guarantee on treatment",
    category: "One-Off Treatments — Domestic",
    unit: "Treatment",
    pricingType: "standard",
    defaultRate: "135.00",
    costPrice: null,
  },
  {
    name: "Bed Bug Treatment — Chemical",
    description: "Bed bug chemical treatment for residential property || Initial inspection and infestation assessment || Two chemical treatment visits (initial + follow-up) || Residual insecticide treatment of mattresses, furniture, skirting, flooring || Guidance on pre- and post-treatment preparation || 30-day guarantee || Treatment per room — price shown is anchor figure for a 1-bedroom property",
    category: "One-Off Treatments — Domestic",
    unit: "Property",
    pricingType: "standard",
    defaultRate: "325.00",
    costPrice: null,
  },
  {
    name: "Cockroach Treatment — Residential",
    description: "Residential cockroach treatment programme || Species identification (German vs Oriental) || Gel baiting and residual insecticide treatment || 2–3 follow-up visits included to achieve clearance || Monitoring stations left in place post-treatment || 60-day guarantee",
    category: "One-Off Treatments — Domestic",
    unit: "Treatment",
    pricingType: "standard",
    defaultRate: "225.00",
    costPrice: null,
  },
  {
    name: "Flea Treatment — Residential",
    description: "Residential flea treatment (whole property) || Thorough property inspection || Full residual spray treatment of all carpeted and soft-furnished areas || Guidance on pre- and post-treatment preparation (vacuum, pet treatment) || Single-visit treatment with 30-day guarantee || Follow-up visit available at reduced rate if required",
    category: "One-Off Treatments — Domestic",
    unit: "Property",
    pricingType: "standard",
    defaultRate: "145.00",
    costPrice: null,
  },
  {
    name: "Ant Treatment — Residential",
    description: "Residential ant treatment || Species identification (garden, pharaoh, ghost) || Gel bait or residual spray treatment as appropriate || Treatment of entry points and trails || Single visit for garden ants; programme for pharaoh ants || 30-day guarantee on garden ant treatment",
    category: "One-Off Treatments — Domestic",
    unit: "Treatment",
    pricingType: "standard",
    defaultRate: "95.00",
    costPrice: null,
  },

  // ───────── One-Off Treatments — Commercial (2) ─────────
  {
    name: "Commercial Rodent Clear-Out",
    description: "One-off rodent clear-out for commercial premises || Comprehensive site survey and entry-point mapping || Baiting programme with appropriate bait stations for the sector (food-safe where required) || 3–4 follow-up visits to achieve clearance || Full documentation and treatment log || Proofing quote provided || Anchor price for medium commercial premises — scales with site size",
    category: "One-Off Treatments — Commercial",
    unit: "Treatment",
    pricingType: "standard",
    defaultRate: "485.00",
    costPrice: null,
  },
  {
    name: "Commercial Crawling / Flying Insect Treatment",
    description: "One-off commercial insect treatment || Species identification and site survey || ULV fogging, residual spray, or gel bait as appropriate || Suitable for flies, cockroaches, beetles, or other crawling/flying insects || Out-of-hours treatment available at supplement || Documentation for health & safety / food audit trail",
    category: "One-Off Treatments — Commercial",
    unit: "Treatment",
    pricingType: "standard",
    defaultRate: "395.00",
    costPrice: null,
  },

  // ───────── Proofing & Exclusion (3) ─────────
  {
    name: "Rodent Proofing Survey",
    description: "Full rodent proofing survey of a commercial or residential property || Inspection of all potential entry points (gaps, vents, roof, drains) || Detailed written report with prioritised recommendations || Photographic evidence of findings || Quotation for remedial works provided separately",
    category: "Proofing & Exclusion",
    unit: "Survey",
    pricingType: "standard",
    defaultRate: "145.00",
    costPrice: null,
  },
  {
    name: "Rodent Proofing Works — Per Hour",
    description: "Rodent proofing remedial works, hourly rate || Sealing of gaps with wire mesh, steel wool, mortar, or sealant || Fitting of door sweeps and vent covers || Drain cap and rodent flap fitting || Materials typically charged separately at cost + markup",
    category: "Proofing & Exclusion",
    unit: "Hour",
    pricingType: "standard",
    defaultRate: "65.00",
    costPrice: null,
  },
  {
    name: "Bird Proofing — Netting or Spikes (per sq m)",
    description: "Bird proofing works per square metre || Pigeon and gull netting or spike systems || Survey and proposal included || Works at height via ladder or access platform (platform hire quoted separately if required) || 5-year product warranty on spikes; 3-year on netting || Humane, non-lethal exclusion only",
    category: "Proofing & Exclusion",
    unit: "Sq m",
    pricingType: "standard",
    defaultRate: "45.00",
    costPrice: null,
  },

  // ───────── Monitoring Systems (2) ─────────
  {
    name: "Electronic Rodent Monitoring — Monthly",
    description: "Electronic rodent monitoring system per unit || 24/7 remote monitoring with instant alerts to site manager and technician || Near-zero chemical use (IPM / non-toxic approach) || Automatic activity logging for compliance || Suitable for high-risk or food-production environments || Monthly monitoring fee per unit — hardware priced separately",
    category: "Monitoring Systems",
    unit: "Unit",
    pricingType: "monthly",
    defaultRate: "12.50",
    costPrice: "6.00",
  },
  {
    name: "Electric Fly Killer — Supply & Install",
    description: "Electric fly killer (EFK) supply and installation || Commercial-grade unit suitable for food premises || Fitted at optimal position (height and location) by trained technician || Includes initial UV tubes and sticky boards || Annual servicing contract available separately || Anchor price for standard 30W unit",
    category: "Monitoring Systems",
    unit: "Unit",
    pricingType: "standard",
    defaultRate: "245.00",
    costPrice: "95.00",
  },

  // ───────── Labour & Callouts (5) ─────────
  {
    name: "Pest Control Technician — Hourly",
    description: "BPCA-qualified pest control technician hourly rate || Minimum 1-hour charge || Treatment chemicals and standard bait stations included || Specialist materials (e.g. heat treatment equipment, large-scale fogging) quoted separately || Standard weekday working hours",
    category: "Labour & Callouts",
    unit: "Hour",
    pricingType: "standard",
    defaultRate: "75.00",
    costPrice: null,
  },
  {
    name: "Senior / BPCA Advanced Technician — Hourly",
    description: "BPCA Advanced Technician or consultant hourly rate || Used for complex cases, audits, and compliance work || Minimum 1-hour charge || Standard weekday working hours || Specialist for bed bug heat treatments, BRC audit support, and training",
    category: "Labour & Callouts",
    unit: "Hour",
    pricingType: "standard",
    defaultRate: "95.00",
    costPrice: null,
  },
  {
    name: "Emergency / Out-of-Hours Callout",
    description: "Emergency pest control callout outside standard working hours || Evenings (after 18:00), weekends, and bank holidays || Minimum 2-hour charge || Typical scenarios: active wasp nest at an event, infestation discovered during a health audit, rodent emergency in food premises || Standard treatments chargeable in addition to callout rate",
    category: "Labour & Callouts",
    unit: "Hour",
    pricingType: "standard",
    defaultRate: "125.00",
    costPrice: null,
  },
  {
    name: "Initial Site Survey",
    description: "Initial site survey for commercial pest control proposal || Full site walk-round and inspection || Pest activity assessment and risk rating || Written proposal with recommended service schedule and pricing || Typically waived if a contract is signed within 30 days || Price shown is paid-survey rate",
    category: "Labour & Callouts",
    unit: "Survey",
    pricingType: "standard",
    defaultRate: "125.00",
    costPrice: null,
  },
  {
    name: "Mileage / Travel Charge",
    description: "Travel charge beyond standard service area || Applied per mile beyond agreed service radius || Covers technician time and vehicle costs || Standard service radius (typically 20 miles) included at no charge on contract work",
    category: "Labour & Callouts",
    unit: "Mile",
    pricingType: "standard",
    defaultRate: "0.65",
    costPrice: null,
  },
] as const;
