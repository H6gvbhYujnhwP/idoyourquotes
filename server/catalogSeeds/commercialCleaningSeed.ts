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
    description: "Recurring office cleaning contract for small sites || Monday–Friday evening cleans || Includes vacuuming, hard floor mopping, desk wipe-down, bin emptying, kitchen clean, toilet clean || Cleaning materials and consumables supplied || Cleaner background-checked and uniformed || Monthly supervisor site visit || Minimum 12-month contract",
    category: "Recurring Cleaning Contracts",
    unit: "Month",
    pricingType: "monthly",
    defaultRate: "495.00",
    costPrice: null,
  },
  {
    name: "Daily Office Cleaning — Medium Site (2,000–10,000 sq ft)",
    description: "Recurring office cleaning contract for medium sites || Monday–Friday evening cleans (or morning, as agreed) || Full office, kitchen, and washroom cleaning || Periodic touch-points included (door handles, switches, shared surfaces) || Cleaning materials supplied; consumables restock included || Fortnightly supervisor site visit with quality audit || Minimum 12-month contract",
    category: "Recurring Cleaning Contracts",
    unit: "Month",
    pricingType: "monthly",
    defaultRate: "1250.00",
    costPrice: null,
  },
  {
    name: "Daily Office Cleaning — Large Site (10,000+ sq ft)",
    description: "Recurring office cleaning contract for large sites || Team-based cleaning, Monday–Friday || Includes office, kitchen, washrooms, meeting rooms, reception || Higher-frequency touch-point cleaning || Dedicated on-site cleaning team || Weekly supervisor site visits and monthly audit report || Cleaning materials supplied; washroom consumables included || Minimum 24-month contract || Price varies significantly by exact footprint — anchor figure for ~15,000 sq ft",
    category: "Recurring Cleaning Contracts",
    unit: "Month",
    pricingType: "monthly",
    defaultRate: "2250.00",
    costPrice: null,
  },
  {
    name: "Retail Cleaning — Daily",
    description: "Daily retail cleaning contract || 7-day or Mon–Sat schedule as agreed || Shop floor vacuum / mop, glass and mirror clean, till area sanitise, fitting rooms || Stockroom tidy (once weekly) || Staff area and washroom clean || Cleaning materials supplied || Minimum 12-month contract",
    category: "Recurring Cleaning Contracts",
    unit: "Month",
    pricingType: "monthly",
    defaultRate: "850.00",
    costPrice: null,
  },
  {
    name: "Healthcare / GP Surgery Cleaning — Daily",
    description: "Daily healthcare premises cleaning contract || Infection-control protocols and colour-coded equipment || Consulting rooms, waiting areas, washrooms, staff areas || Touch-point sanitising and high-risk surface cleaning || CQC-compliant documentation and cleaning logs || Staff trained in healthcare cleaning (BICSc Level 2 minimum) || Cleaning materials and hospital-grade disinfectants supplied || Minimum 12-month contract",
    category: "Recurring Cleaning Contracts",
    unit: "Month",
    pricingType: "monthly",
    defaultRate: "1650.00",
    costPrice: null,
  },
  {
    name: "Communal Area Cleaning — Residential Block / Commercial",
    description: "Communal area cleaning contract for residential or commercial buildings || Weekly visits (frequency variable) || Entrance halls, stairwells, lifts, corridors, bin stores || Hard floor mopping and vacuuming of carpeted areas || Glass cleaning (internal doors and panels) || Cobweb removal and fitting dusting || Cleaning materials supplied || Minimum 6-month contract",
    category: "Recurring Cleaning Contracts",
    unit: "Month",
    pricingType: "monthly",
    defaultRate: "385.00",
    costPrice: null,
  },

  // ───────── Periodic Deep Cleans (4) ─────────
  {
    name: "Deep Clean — Office (per sq ft)",
    description: "Periodic deep clean charged per square foot || Full kitchen and washroom deep clean || Upholstery vacuum and spot treatment || Hard floor strip, clean, and seal / polish || High-level dusting (vents, light fittings, tops of cabinets) || Interior window clean || Typically scheduled annually or twice yearly on office contracts",
    category: "Periodic Deep Cleans",
    unit: "Sq ft",
    pricingType: "standard",
    defaultRate: "0.35",
    costPrice: null,
  },
  {
    name: "Carpet Cleaning — Per Sq Ft",
    description: "Hot water extraction carpet cleaning || Pre-treatment for stains and heavy soiling || Industrial extraction equipment || Rapid-dry process suitable for office use || Spot-treatment of visible marks included || Deodorising treatment included",
    category: "Periodic Deep Cleans",
    unit: "Sq ft",
    pricingType: "standard",
    defaultRate: "0.65",
    costPrice: null,
  },
  {
    name: "Hard Floor Strip, Clean & Polish",
    description: "Hard floor restoration clean || Strip of existing sealant or polish || Deep clean with industrial scrubber-dryer || Two coats of commercial-grade floor polish || Suitable for vinyl, linoleum, terrazzo, and most stone floors || Buff finish included",
    category: "Periodic Deep Cleans",
    unit: "Sq m",
    pricingType: "standard",
    defaultRate: "4.50",
    costPrice: null,
  },
  {
    name: "Window Cleaning — Internal, Commercial Premises",
    description: "Internal window and glass partition cleaning || All internal windows, glass doors, and partitions at reachable height || Use of extendable equipment for higher panels || Streak-free finish || Typically scheduled monthly or quarterly on recurring contracts, one-off rate shown here",
    category: "Periodic Deep Cleans",
    unit: "Visit",
    pricingType: "standard",
    defaultRate: "125.00",
    costPrice: null,
  },

  // ───────── Specialist Services (6) ─────────
  {
    name: "Post-Construction / Builders' Clean",
    description: "Post-construction sparkle clean per square foot || Full dust removal from all surfaces (inside cabinets, ledges, skirting) || Protective film removal from windows, doors, appliances || Mortar and paint splash removal || Final polish of fixtures, fittings, and glass || Industrial vacuum of all floors and final clean || Photos of completed work provided",
    category: "Specialist Services",
    unit: "Sq ft",
    pricingType: "standard",
    defaultRate: "0.45",
    costPrice: null,
  },
  {
    name: "End-of-Tenancy / Void Property Clean",
    description: "End-of-tenancy or void property clean (per property) || Full interior clean to handover standard || Kitchen deep clean including oven, extractor, fridge, freezer || Full bathroom descale and sanitise || Carpets vacuumed; spot-treatment of stains || All surfaces, skirting, doors, and handles cleaned || Windows cleaned internally || Price anchor for 3-bed residential — scales with property size",
    category: "Specialist Services",
    unit: "Property",
    pricingType: "standard",
    defaultRate: "295.00",
    costPrice: null,
  },
  {
    name: "Upholstery Cleaning — Per Office Chair",
    description: "Office chair fabric cleaning || Hot water extraction process || Pre-treatment of stains and heavy soiling || Deodorising treatment || Quick-dry for next-day use || Bulk pricing available — per-chair rate shown",
    category: "Specialist Services",
    unit: "Chair",
    pricingType: "standard",
    defaultRate: "15.00",
    costPrice: null,
  },
  {
    name: "Pressure / Jet Washing",
    description: "Pressure washing of external surfaces (per sq m) || Suitable for car parks, patios, walkways, external walls || Industrial pressure washer equipment || Biodegradable cleaning solution where required || Moss, algae, and general grime removal || Rinsed and swept on completion",
    category: "Specialist Services",
    unit: "Sq m",
    pricingType: "standard",
    defaultRate: "2.25",
    costPrice: null,
  },
  {
    name: "Graffiti Removal",
    description: "Graffiti removal from external surfaces (per sq m) || Chemical graffiti remover appropriate to substrate || Pressure wash rinse || Suitable for brick, concrete, painted surfaces, and metal || Fast-response callout available on ongoing contracts",
    category: "Specialist Services",
    unit: "Sq m",
    pricingType: "standard",
    defaultRate: "28.00",
    costPrice: null,
  },
  {
    name: "Biohazard / Trauma Cleanup",
    description: "Biohazard and specialist infection-control clean (per callout) || Trained technicians with appropriate PPE || Disposal of contaminated materials to licensed waste route || Full disinfection and sanitisation to industry standard || Documentation trail for insurance / compliance || Starting rate shown — quoted per incident based on scale",
    category: "Specialist Services",
    unit: "Callout",
    pricingType: "standard",
    defaultRate: "495.00",
    costPrice: null,
  },

  // ───────── Washroom & Consumables (4) ─────────
  {
    name: "Washroom Services Contract",
    description: "Monthly washroom services and hygiene contract || Sanitary bin servicing (typically monthly, frequency variable) || Nappy bin servicing where applicable || Air freshener units supplied and serviced || Urinal sanitiser dosing units || Certificate of waste transfer provided || Price anchor per washroom — scales with number of bins and service frequency",
    category: "Washroom & Consumables",
    unit: "Washroom",
    pricingType: "monthly",
    defaultRate: "18.00",
    costPrice: null,
  },
  {
    name: "Consumables — Monthly Supply Contract",
    description: "Monthly supply of washroom and kitchen consumables || Toilet rolls, hand towels, hand soap || Kitchen cleaning products and dishwasher tablets || Delivery included; dispensers supplied on loan || Price anchor for a medium office (~30 users) — scales with headcount",
    category: "Washroom & Consumables",
    unit: "Month",
    pricingType: "monthly",
    defaultRate: "95.00",
    costPrice: "55.00",
  },
  {
    name: "Feminine Hygiene Unit Service",
    description: "Sanitary disposal unit servicing || Fortnightly or monthly servicing (as agreed) || Sealed unit exchange with liner included || Certificate of waste transfer provided || Per-unit price — multiple units discounted on contract",
    category: "Washroom & Consumables",
    unit: "Unit",
    pricingType: "monthly",
    defaultRate: "6.50",
    costPrice: null,
  },
  {
    name: "Air Freshener Service",
    description: "Automatic air freshener service || Dispenser supplied on loan || Monthly or quarterly refill (as agreed) || Range of fragrance options || Per-unit price — multiple units discounted on contract",
    category: "Washroom & Consumables",
    unit: "Unit",
    pricingType: "monthly",
    defaultRate: "4.50",
    costPrice: null,
  },

  // ───────── One-Off Callouts (2) ─────────
  {
    name: "One-Off Office Clean",
    description: "Single-visit office clean (non-contract) || Standard office clean scope: floors, surfaces, kitchen, toilets, bins || Ideal for one-off event cleans, post-meeting cleans, or cover cleans || Priced per visit based on typical 3-hour scope for medium office || Scales with size and scope",
    category: "One-Off Callouts",
    unit: "Visit",
    pricingType: "standard",
    defaultRate: "165.00",
    costPrice: null,
  },
  {
    name: "Emergency Callout — Out of Hours",
    description: "Emergency out-of-hours cleaning callout || Response within agreed SLA (typically 2–4 hours) || Available evenings, weekends, and bank holidays || Suitable for flood, spill, vandalism, or urgent event clean || Minimum 2-hour charge || Materials and disposal included where applicable",
    category: "One-Off Callouts",
    unit: "Hour",
    pricingType: "standard",
    defaultRate: "65.00",
    costPrice: null,
  },

  // ───────── Labour Rates (4) ─────────
  {
    name: "Cleaner — Daytime",
    description: "General commercial cleaner, daytime shift || Hourly rate for ad-hoc or contract work || Weekday 07:00–18:00 || Includes standard cleaning materials",
    category: "Labour Rates",
    unit: "Hour",
    pricingType: "standard",
    defaultRate: "22.00",
    costPrice: null,
  },
  {
    name: "Cleaner — Out of Hours (Evening / Early Morning)",
    description: "General commercial cleaner, out-of-hours shift || Hourly rate for work outside standard daytime || Evenings, early mornings, or split shifts || Most common rate on office contracts (evening cleans) || Includes standard cleaning materials",
    category: "Labour Rates",
    unit: "Hour",
    pricingType: "standard",
    defaultRate: "25.00",
    costPrice: null,
  },
  {
    name: "Cleaner — Weekend / Bank Holiday",
    description: "General commercial cleaner, weekend or bank holiday uplift rate || Hourly rate for Saturday, Sunday, or bank holiday work || Typically 1.5× weekday rate || Includes standard cleaning materials",
    category: "Labour Rates",
    unit: "Hour",
    pricingType: "standard",
    defaultRate: "32.00",
    costPrice: null,
  },
  {
    name: "Supervisor / Team Leader",
    description: "Supervisor or team leader hourly rate || Oversight of cleaning teams on larger contracts || Quality audits and site inspections || Client-facing point of contact on recurring contracts || Training and induction of new cleaners",
    category: "Labour Rates",
    unit: "Hour",
    pricingType: "standard",
    defaultRate: "32.00",
    costPrice: null,
  },
] as const;
