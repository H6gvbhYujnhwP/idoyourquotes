// server/services/templateLibrary.ts
//
// Phase 1 — template discovery and metadata for the v2.1 library.
//
// Single source of truth for what templates exist and where they live
// on disk. Used by:
//   - templateRenderer (resolve templateId → HTML path + assets dir)
//   - the eventual picker UI in Phase 3 (list templates per sector with
//     display names and preview thumbnail paths)
//   - validation guards in routers (Phase 2) before invoking the renderer
//
// The library is shipped as a static asset tree under server/templates/
// library/<sector>/<style>/ — see Phase 1's library ingestion for the
// folder structure.

import * as path from "path";
import * as fs from "fs";
import { fileURLToPath } from "url";

// ESM equivalent of __dirname. The repo uses "type": "module" so the
// CommonJS __dirname global isn't available.
const _filename = fileURLToPath(import.meta.url);
const _dirname = path.dirname(_filename);

// ── Static metadata ─────────────────────────────────────────────────

/** Sectors currently supported by the app. Must match the trade preset
 *  values in the orgs table. The electrical sector is permanently out
 *  per the GTM decision — only these four exist. */
export const SECTORS = ["it-services", "commercial-cleaning", "web-marketing", "pest-control"] as const;
export type SectorId = (typeof SECTORS)[number];

/** Six design directions per sector. IDs match the folder names Manus
 *  uses inside the library (e.g. "01-split-screen"). */
export const STYLES = [
  "01-split-screen",
  "02-magazine",
  "03-dark-premium",
  "04-cards-grid",
  "05-geometric",
  "06-clean-tech",
] as const;
export type StyleId = (typeof STYLES)[number];

/** Human-readable display names + one-line descriptions for the picker UI.
 *  Phase 3 will surface these. Keeping the strings here avoids hardcoding
 *  copy in React components. */
export const STYLE_META: Record<StyleId, { name: string; description: string }> = {
  "01-split-screen": {
    name: "Split Screen",
    description: "Half cinematic image, half clean content panel. Professional and modern.",
  },
  "02-magazine": {
    name: "Magazine",
    description: "Full-bleed cover with bold display headline. Editorial style.",
  },
  "03-dark-premium": {
    name: "Dark Premium",
    description: "Restrained, luxury feel with serif typography on a dark canvas.",
  },
  "04-cards-grid": {
    name: "Cards & Grid",
    description: "Image mosaic cover with structured card-based interior. Friendly and corporate.",
  },
  "05-geometric": {
    name: "Geometric Bold",
    description: "Diagonal cuts and uppercase display type. Bold and angular.",
  },
  "06-clean-tech": {
    name: "Clean Tech",
    description: "White canvas with accent block. Minimal and technical.",
  },
};

export const SECTOR_META: Record<SectorId, { name: string }> = {
  "it-services": { name: "IT Services" },
  "commercial-cleaning": { name: "Commercial Cleaning" },
  "web-marketing": { name: "Web & Digital Marketing" },
  "pest-control": { name: "Pest Control" },
};

// ── Library root resolution ─────────────────────────────────────────

/**
 * Resolve the library root directory. Override via env var when running
 * in unusual environments (tests, deployment quirks); otherwise computed
 * relative to this file's location.
 *
 * In production on Render the file layout after build looks like:
 *   /opt/render/project/src/server/templates/library/<sector>/<style>/
 * which is where this resolver points by default.
 */
function getLibraryRoot(): string {
  const override = process.env.TEMPLATE_LIBRARY_ROOT;
  if (override) return override;
  // From server/services/templateLibrary.ts → server/templates/library
  return path.resolve(_dirname, "..", "templates", "library");
}

// ── Public API ──────────────────────────────────────────────────────

/** Fully-resolved template definition. */
export interface TemplateDef {
  id: string; // "it-services/01-split-screen"
  sectorId: SectorId;
  styleId: StyleId;
  sectorName: string;
  styleName: string;
  styleDescription: string;
  /** Absolute path to the template's index.html on disk. */
  htmlPath: string;
  /** Absolute path to the template's assets directory. */
  assetsDir: string;
  /** Absolute path to the template's directory (parent of index.html). */
  templateDir: string;
}

/**
 * Resolve a templateId to its full definition, or null if the id is
 * malformed or no such template exists. Used as the validation gate
 * before any render attempt.
 *
 * Accepts both "sector/style" form and an object form, so callers can
 * use whichever is more convenient.
 */
export function getTemplate(templateId: string): TemplateDef | null {
  const parsed = parseTemplateId(templateId);
  if (!parsed) return null;
  const { sectorId, styleId } = parsed;

  const templateDir = path.join(getLibraryRoot(), sectorId, styleId);
  const htmlPath = path.join(templateDir, "index.html");

  // Defend against partial deploys / missing files. Cheaper than
  // discovering it inside puppeteer.
  if (!fs.existsSync(htmlPath)) {
    return null;
  }

  return {
    id: `${sectorId}/${styleId}`,
    sectorId,
    styleId,
    sectorName: SECTOR_META[sectorId].name,
    styleName: STYLE_META[styleId].name,
    styleDescription: STYLE_META[styleId].description,
    htmlPath,
    assetsDir: path.join(templateDir, "assets"),
    templateDir,
  };
}

/**
 * List all templates available for a given sector. Used by the Phase 3
 * picker UI: when a user opens "Designed for you", filter to their
 * sector's six designs.
 */
export function listTemplatesForSector(sectorId: SectorId): TemplateDef[] {
  return STYLES
    .map((styleId) => getTemplate(`${sectorId}/${styleId}`))
    .filter((t): t is TemplateDef => t !== null);
}

/**
 * List every template in the library. Used by admin tooling and the
 * test render script. Order is sector-then-style for stable iteration.
 */
export function listAllTemplates(): TemplateDef[] {
  return SECTORS.flatMap((sectorId) => listTemplatesForSector(sectorId));
}

/**
 * Lightweight validation — returns true if the id parses and the
 * corresponding folder exists on disk. Use this in router input guards
 * before persisting a user's template choice to the quotes table.
 */
export function validateTemplateId(templateId: string): boolean {
  return getTemplate(templateId) !== null;
}

/**
 * Map a trade-preset string (as stored on organizations.tradePreset)
 * to a sector id. Tolerant — returns null if no mapping exists so the
 * caller can fall back to a default sector for picker filtering.
 *
 * The trade preset values currently in use map cleanly to sector ids;
 * this function exists as a single point to extend if naming diverges
 * later.
 */
export function tradePresetToSector(tradePreset: string | null | undefined): SectorId | null {
  if (!tradePreset) return null;
  switch (tradePreset) {
    case "it-services":
    case "it":
      return "it-services";
    case "commercial-cleaning":
    case "cleaning":
      return "commercial-cleaning";
    case "web-marketing":
    case "web":
    case "digital-marketing":
      return "web-marketing";
    case "pest-control":
    case "pest":
      return "pest-control";
    default:
      return null;
  }
}

// ── Internals ───────────────────────────────────────────────────────

function parseTemplateId(templateId: string): { sectorId: SectorId; styleId: StyleId } | null {
  if (typeof templateId !== "string" || !templateId.includes("/")) return null;
  const [sectorRaw, styleRaw] = templateId.split("/", 2);
  if (!sectorRaw || !styleRaw) return null;
  if (!(SECTORS as readonly string[]).includes(sectorRaw)) return null;
  if (!(STYLES as readonly string[]).includes(styleRaw)) return null;
  return { sectorId: sectorRaw as SectorId, styleId: styleRaw as StyleId };
}
