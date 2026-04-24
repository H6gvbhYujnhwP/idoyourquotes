/**
 * Phase 4A — Proposal showcase assets.
 *
 * Pre-rendered previews of the three winning Contract/Tender proposal
 * templates, filled with fictional but realistic example data. Served as
 * static files from /public/proposal-showcase — no Vite bundling, no cache
 * hashing, so they can be referenced directly in landing/pricing pages,
 * the Solo upgrade modal, and OG meta tags.
 *
 * Renders come in three sizes:
 *  - hero   (1800×2250 .webp) — full-width landing/pricing page use
 *  - thumb  (800×1000  .webp) — modal / format-picker card use
 *  - social (1200×630  .jpg)  — OG image / social share use (JPEG for
 *                              maximum platform compatibility)
 *
 * Fictional companies used in the example data:
 *  - IT-Modern:            Meridian Solutions Ltd  →  Ashworth & Partners
 *  - Cleaning-Operational: Sparkshire Facilities Ltd → Oakwell Business Park
 *  - Marketing-Bold:       Pivot Digital           →  Harwood Retail Group
 *
 * Source HTML (for re-rendering if example data changes) lives alongside
 * the assets at /public/proposal-showcase/source/*.html.
 */

export type ProposalShowcaseSector = "it" | "cleaning" | "marketing";
export type ProposalShowcaseSize = "hero" | "thumb" | "social";

export interface ProposalShowcaseVariant {
  /** Machine key — stable identifier, safe for analytics / persistence */
  key: ProposalShowcaseSector;
  /** Human-readable sector label */
  sectorLabel: string;
  /** Personality name Manus assigned to this template */
  personality: string;
  /** One-line description for card/modal copy */
  tagline: string;
  /** Asset URLs (served from /public — no import, no hashing) */
  assets: {
    hero: string;
    thumb: string;
    social: string;
  };
}

const BASE = "/proposal-showcase";

export const PROPOSAL_SHOWCASES: Record<ProposalShowcaseSector, ProposalShowcaseVariant> = {
  it: {
    key: "it",
    sectorLabel: "IT Services",
    personality: "Modern",
    tagline: "Managed IT & cyber security contract — KPI-led, boardroom-ready.",
    assets: {
      hero: `${BASE}/it-modern-hero.webp`,
      thumb: `${BASE}/it-modern-thumb.webp`,
      social: `${BASE}/it-modern-social.jpg`,
    },
  },
  cleaning: {
    key: "cleaning",
    sectorLabel: "Commercial Cleaning",
    personality: "Operational",
    tagline: "FM-grade cleaning specification with accreditations and scope summary.",
    assets: {
      hero: `${BASE}/cleaning-operational-hero.webp`,
      thumb: `${BASE}/cleaning-operational-thumb.webp`,
      social: `${BASE}/cleaning-operational-social.jpg`,
    },
  },
  marketing: {
    key: "marketing",
    sectorLabel: "Website & Digital Marketing",
    personality: "Bold",
    tagline: "Twelve-month retainer proposal with KPI targets and clear accountability.",
    assets: {
      hero: `${BASE}/marketing-bold-hero.webp`,
      thumb: `${BASE}/marketing-bold-thumb.webp`,
      social: `${BASE}/marketing-bold-social.jpg`,
    },
  },
};

/** Ordered list — useful for showcase strips / carousels. */
export const PROPOSAL_SHOWCASE_ORDER: readonly ProposalShowcaseSector[] = [
  "it",
  "cleaning",
  "marketing",
] as const;

/**
 * Resolve a single asset URL. Prefer this over indexing PROPOSAL_SHOWCASES
 * directly — it keeps usage type-narrowed.
 */
export function getProposalShowcaseAsset(
  sector: ProposalShowcaseSector,
  size: ProposalShowcaseSize,
): string {
  return PROPOSAL_SHOWCASES[sector].assets[size];
}
