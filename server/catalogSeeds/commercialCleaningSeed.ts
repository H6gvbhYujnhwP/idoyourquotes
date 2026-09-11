/**
 * Commercial Cleaning — Starter Catalog Seed
 *
 * 26 items covering the common offering for a UK commercial cleaning firm
 * serving B2B clients (offices, retail, healthcare, industrial): recurring
 * cleaning contracts, periodic deep cleans, specialist services, washroom
 * and consumables, one-off callouts, and labour rates.
 *
 * Prices are UK mid-market reference points — every firm that signs up will
 * edit these to match their own operating costs, regional rates, and client
 * mix.
 *
 * Fired by:
 *   - server/db.ts createUser() — automatic on new Commercial Cleaning
 *     sector registration
 *   - server/routers.ts catalog.seedFromSectorTemplate — manual button in UI
 *
 * All prices are EXCLUSIVE of VAT. Recurring contracts use pricingType
 * "monthly" — the price shown is the monthly retainer, regardless of visit
 * cadence. Where a contract is quarterly-billed in real life, the commitment
 * and visit schedule sit in the description; the monthly figure is the
 * average monthly cost for comparison.
 *
 * Naming convention follows how UK commercial cleaning firms label their
 * offering so AI extraction from incumbent-provider invoices matches cleanly.
 * Typical incumbent invoices read "Monthly office cleaning — Mon–Fri evenings"
 * or "Washroom services quarterly" — our catalog names mirror that language.
 */

import type { CatalogSeedItem } from "./itServicesSeed";

export const COMMERCIAL_CLEANING_CATALOG_SEED: readonly CatalogSeedItem[] = [
  // ───────── Recurring Cleaning Contracts (6) ─────────
  {
    name: "Daily Office Cleaning — Small Site (under 2,000 sq ft)",
    description: "Recurring office cleaning contract for small sites\nMonday–Friday evening cleans\nIncludes vacuuming, hard floor mopping, desk wipe-down, bin emptying, kitchen clean, toilet clean\nCleaning materials and consumables supplied\nCleaner background-checked and uniformed\nMonthly supervisor site visit\nMinimum 12-month contract",
    category: "Recurring Cleaning Contracts",
    unit: "Month",
    pricingType: "monthly",
    defaultRate: "495.00",
    costPrice: null,
  },
  {
    name: "Daily Office Cleaning — Medium Site (2,000–10,000 sq ft)",
    description: "Recurring office cleaning contract for medium sites\nMonday–Friday evening cleans (or morning, as agreed)\nFull office, kitchen, and washroom cleaning\nPeriodic touch-points included (door handles, switches, shared surfaces)\nCleaning materials supplied; consumables restock included\nFortnightly supervisor site visit with quality audit\nMinimum 12-month contract",
    category: "Recurring Cleaning Contracts",
    unit: "Month",
    pricingType: "monthly",
    defaultRate: "1250.00",
    costPrice: null,
  },
  {
    name: "Daily Office Cleaning — Large Site (10,000+ sq ft)",
    description: "Recurring office cleaning contract for large sites\nTeam-based cleaning, Monday–Friday\nIncludes office, kitchen, washrooms, meeting rooms, reception\nHigher-frequency touch-point cleaning\nDedicated on-site cleaning team\nWeekly supervisor site visits and monthly audit report\nCleaning materials supplied; washroom consumables included\nMinimum 24-month contract\nPrice varies significantly by exact footprint — anchor figure for ~15,000 sq ft",
    category: "Recurring Cleaning Contracts",
    unit: "Month",
    pricingType: "monthly",
    defaultRate: "2250.00",
    costPrice: null,
  },
  {
    name: "Retail Cleaning — Daily",
    description: "Daily retail cleaning contract\n7-day or Mon–Sat schedule as agreed\nShop floor vacuum / mop, glass and mirror clean, till area sanitise, fitting rooms\nStockroom tidy (once weekly)\nStaff area and washroom clean\nCleaning materials supplied\nMinimum 12-month contract",
    category: "Recurring Cleaning Contracts",
    unit: "Month",
    pricingType: "monthly",
    defaultRate: "850.00",
    costPrice: null,
  },
  {
    name: "Healthcare / GP Surgery Cleaning — Daily",
    description: "Daily healthcare premises cleaning contract\nInfection-control protocols and colour-coded equipment\nConsulting rooms, waiting areas, washrooms, staff areas\nTouch-point sanitising and high-risk surface cleaning\nCQC-compliant documentation and cleaning logs\nStaff trained in healthcare cleaning (BICSc Level 2 minimum)\nCleaning materials and hospital-grade disinfectants supplied\nMinimum 12-month contract",
    category: "Recurring Cleaning Contracts",
    unit: "Month",
    pricingType: "monthly",
    defaultRate: "1650.00",
    costPrice: null,
  },
  {
    name: "Communal Area Cleaning — Residential Block / Commercial",
    description: "Communal area cleaning contract for residential or commercial buildings\nWeekly visits (frequency variable)\nEntrance halls, stairwells, lifts, corridors, bin stores\nHard floor mopping and vacuuming of carpeted areas\nGlass cleaning (internal doors and panels)\nCobweb removal and fitting dusting\nCleaning materials supplied\nMinimum 6-month contract",
    category: "Recurring Cleaning Contracts",
    unit: "Month",
    pricingType: "monthly",
    defaultRate: "385.00",
    costPrice: null,
  },

  // ───────── Periodic Deep Cleans (4) ─────────
  {
    name: "Deep Clean — Office (per sq ft)",
    description: "Periodic deep clean charged per square foot\nFull kitchen and washroom deep clean\nUpholstery vacuum and spot treatment\nHard floor strip, clean, and seal / polish\nHigh-level dusting (vents, light fittings, tops of cabinets)\nInterior window clean\nTypically scheduled annually or twice yearly on office contracts",
    category: "Periodic Deep Cleans",
    unit: "Sq ft",
    pricingType: "standard",
    defaultRate: "0.35",
    costPrice: null,
  },
  {
    name: "Carpet Cleaning — Per Sq Ft",
    description: "Hot water extraction carpet cleaning\nPre-treatment for stains and heavy soiling\nIndustrial extraction equipment\nRapid-dry process suitable for office use\nSpot-treatment of visible marks included\nDeodorising treatment included",
    category: "Periodic Deep Cleans",
    unit: "Sq ft",
    pricingType: "standard",
    defaultRate: "0.65",
    costPrice: null,
  },
  {
    name: "Hard Floor Strip, Clean & Polish",
    description: "Hard floor restoration clean\nStrip of existing sealant or polish\nDeep clean with industrial scrubber-dryer\nTwo coats of commercial-grade floor polish\nSuitable for vinyl, linoleum, terrazzo, and most stone floors\nBuff finish included",
    category: "Periodic Deep Cleans",
    unit: "Sq m",
    pricingType: "standard",
    defaultRate: "4.50",
    costPrice: null,
  },
  {
    name: "Window Cleaning — Internal, Commercial Premises",
    description: "Internal window and glass partition cleaning\nAll internal windows, glass doors, and partitions at reachable height\nUse of extendable equipment for higher panels\nStreak-free finish\nTypically scheduled monthly or quarterly on recurring contracts, one-off rate shown here",
    category: "Periodic Deep Cleans",
    unit: "Visit",
    pricingType: "standard",
    defaultRate: "125.00",
    costPrice: null,
  },

  // ───────── Specialist Services (6) ─────────
  {
    name: "Post-Construction / Builders' Clean",
    description: "Post-construction sparkle clean per square foot\nFull dust removal from all surfaces (inside cabinets, ledges, skirting)\nProtective film removal from windows, doors, appliances\nMortar and paint splash removal\nFinal polish of fixtures, fittings, and glass\nIndustrial vacuum of all floors and final clean\nPhotos of completed work provided",
    category: "Specialist Services",
    unit: "Sq ft",
    pricingType: "standard",
    defaultRate: "0.45",
    costPrice: null,
  },
  {
    name: "End-of-Tenancy / Void Property Clean",
    description: "End-of-tenancy or void property clean (per property)\nFull interior clean to handover standard\nKitchen deep clean including oven, extractor, fridge, freezer\nFull bathroom descale and sanitise\nCarpets vacuumed; spot-treatment of stains\nAll surfaces, skirting, doors, and handles cleaned\nWindows cleaned internally\nPrice anchor for 3-bed residential — scales with property size",
    category: "Specialist Services",
    unit: "Property",
    pricingType: "standard",
    defaultRate: "295.00",
    costPrice: null,
  },
  {
    name: "Upholstery Cleaning — Per Office Chair",
    description: "Office chair fabric cleaning\nHot water extraction process\nPre-treatment of stains and heavy soiling\nDeodorising treatment\nQuick-dry for next-day use\nBulk pricing available — per-chair rate shown",
    category: "Specialist Services",
    unit: "Chair",
    pricingType: "standard",
    defaultRate: "15.00",
    costPrice: null,
  },
  {
    name: "Pressure / Jet Washing",
    description: "Pressure washing of external surfaces (per sq m)\nSuitable for car parks, patios, walkways, external walls\nIndustrial pressure washer equipment\nBiodegradable cleaning solution where required\nMoss, algae, and general grime removal\nRinsed and swept on completion",
    category: "Specialist Services",
    unit: "Sq m",
    pricingType: "standard",
    defaultRate: "2.25",
    costPrice: null,
  },
  {
    name: "Graffiti Removal",
    description: "Graffiti removal from external surfaces (per sq m)\nChemical graffiti remover appropriate to substrate\nPressure wash rinse\nSuitable for brick, concrete, painted surfaces, and metal\nFast-response callout available on ongoing contracts",
    category: "Specialist Services",
    unit: "Sq m",
    pricingType: "standard",
    defaultRate: "28.00",
    costPrice: null,
  },
  {
    name: "Biohazard / Trauma Cleanup",
    description: "Biohazard and specialist infection-control clean (per callout)\nTrained technicians with appropriate PPE\nDisposal of contaminated materials to licensed waste route\nFull disinfection and sanitisation to industry standard\nDocumentation trail for insurance / compliance\nStarting rate shown — quoted per incident based on scale",
    category: "Specialist Services",
    unit: "Callout",
    pricingType: "standard",
    defaultRate: "495.00",
    costPrice: null,
  },

  // ───────── Washroom & Consumables (4) ─────────
  {
    name: "Washroom Services Contract",
    description: "Monthly washroom services and hygiene contract\nSanitary bin servicing (typically monthly, frequency variable)\nNappy bin servicing where applicable\nAir freshener units supplied and serviced\nUrinal sanitiser dosing units\nCertificate of waste transfer provided\nPrice anchor per washroom — scales with number of bins and service frequency",
    category: "Washroom & Consumables",
    unit: "Washroom",
    pricingType: "monthly",
    defaultRate: "18.00",
    costPrice: null,
  },
  {
    name: "Consumables — Monthly Supply Contract",
    description: "Monthly supply of washroom and kitchen consumables\nToilet rolls, hand towels, hand soap\nKitchen cleaning products and dishwasher tablets\nDelivery included; dispensers supplied on loan\nPrice anchor for a medium office (~30 users) — scales with headcount",
    category: "Washroom & Consumables",
    unit: "Month",
    pricingType: "monthly",
    defaultRate: "95.00",
    costPrice: "55.00",
  },
  {
    name: "Feminine Hygiene Unit Service",
    description: "Sanitary disposal unit servicing\nFortnightly or monthly servicing (as agreed)\nSealed unit exchange with liner included\nCertificate of waste transfer provided\nPer-unit price — multiple units discounted on contract",
    category: "Washroom & Consumables",
    unit: "Unit",
    pricingType: "monthly",
    defaultRate: "6.50",
    costPrice: null,
  },
  {
    name: "Air Freshener Service",
    description: "Automatic air freshener service\nDispenser supplied on loan\nMonthly or quarterly refill (as agreed)\nRange of fragrance options\nPer-unit price — multiple units discounted on contract",
    category: "Washroom & Consumables",
    unit: "Unit",
    pricingType: "monthly",
    defaultRate: "4.50",
    costPrice: null,
  },

  // ───────── One-Off Callouts (2) ─────────
  {
    name: "One-Off Office Clean",
    description: "Single-visit office clean (non-contract)\nStandard office clean scope: floors, surfaces, kitchen, toilets, bins\nIdeal for one-off event cleans, post-meeting cleans, or cover cleans\nPriced per visit based on typical 3-hour scope for medium office\nScales with size and scope",
    category: "One-Off Callouts",
    unit: "Visit",
    pricingType: "standard",
    defaultRate: "165.00",
    costPrice: null,
  },
  {
    name: "Emergency Callout — Out of Hours",
    description: "Emergency out-of-hours cleaning callout\nResponse within agreed SLA (typically 2–4 hours)\nAvailable evenings, weekends, and bank holidays\nSuitable for flood, spill, vandalism, or urgent event clean\nMinimum 2-hour charge\nMaterials and disposal included where applicable",
    category: "One-Off Callouts",
    unit: "Hour",
    pricingType: "standard",
    defaultRate: "65.00",
    costPrice: null,
  },

  // ───────── Labour Rates (4) ─────────
  {
    name: "Cleaner — Daytime",
    description: "General commercial cleaner, daytime shift\nHourly rate for ad-hoc or contract work\nWeekday 07:00–18:00\nIncludes standard cleaning materials",
    category: "Labour Rates",
    unit: "Hour",
    pricingType: "standard",
    defaultRate: "22.00",
    costPrice: null,
  },
  {
    name: "Cleaner — Out of Hours (Evening / Early Morning)",
    description: "General commercial cleaner, out-of-hours shift\nHourly rate for work outside standard daytime\nEvenings, early mornings, or split shifts\nMost common rate on office contracts (evening cleans)\nIncludes standard cleaning materials",
    category: "Labour Rates",
    unit: "Hour",
    pricingType: "standard",
    defaultRate: "25.00",
    costPrice: null,
  },
  {
    name: "Cleaner — Weekend / Bank Holiday",
    description: "General commercial cleaner, weekend or bank holiday uplift rate\nHourly rate for Saturday, Sunday, or bank holiday work\nTypically 1.5× weekday rate\nIncludes standard cleaning materials",
    category: "Labour Rates",
    unit: "Hour",
    pricingType: "standard",
    defaultRate: "32.00",
    costPrice: null,
  },
  {
    name: "Supervisor / Team Leader",
    description: "Supervisor or team leader hourly rate\nOversight of cleaning teams on larger contracts\nQuality audits and site inspections\nClient-facing point of contact on recurring contracts\nTraining and induction of new cleaners",
    category: "Labour Rates",
    unit: "Hour",
    pricingType: "standard",
    defaultRate: "32.00",
    costPrice: null,
  },
] as const;
