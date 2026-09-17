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
// Delivery 2.14 Chunk 1 — the canonical sector vocabulary. This module
// is the only place that knows how a stored trade preset relates to a
// template library folder, and it is shared with the client so the
// picker and the server default can no longer drift apart.
import {
  TEMPLATE_SECTORS,
  TEMPLATE_SECTOR_NAMES,
  DEFAULT_TEMPLATE_SECTOR,
  templateSectorFor,
  resolveTemplateSector,
  type TemplateSectorId,
} from "@shared/sectors";

// ESM equivalent of __dirname. The repo uses "type": "module" so the
// CommonJS __dirname global isn't available.
const _filename = fileURLToPath(import.meta.url);
const _dirname = path.dirname(_filename);

// ── Static metadata ─────────────────────────────────────────────────

/** Sectors currently supported by the app.
 *
 *  Delivery 2.14 Chunk 1 — re-exported from the canonical vocabulary in
 *  shared/sectors.ts rather than declared here. The list is unchanged;
 *  what changed is that there is now one definition of it instead of
 *  three that disagreed. The comment that used to sit here claimed the
 *  values "must match the trade preset values in the orgs table" — they
 *  never did, which is precisely the bug this delivery fixes: trade
 *  presets are underscored ("commercial_cleaning") and these are
 *  hyphenated folder names ("commercial-cleaning"). The translation
 *  between the two now lives in one place. */
export const SECTORS = TEMPLATE_SECTORS;
export type SectorId = TemplateSectorId;

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
  // Delivery 2.14 Chunk 1 — names come from the shared vocabulary so the
  // server and the picker cannot show different labels for the same
  // sector. The strings themselves are unchanged.
  "it-services": { name: TEMPLATE_SECTOR_NAMES["it-services"] },
  "commercial-cleaning": { name: TEMPLATE_SECTOR_NAMES["commercial-cleaning"] },
  "web-marketing": { name: TEMPLATE_SECTOR_NAMES["web-marketing"] },
  "pest-control": { name: TEMPLATE_SECTOR_NAMES["pest-control"] },
};

// ── Library root resolution ─────────────────────────────────────────

/**
 * Resolve the library root directory.
 *
 * THE BUG THIS FIXES
 *   The library lives in the repo at server/templates/library/. The
 *   old resolver was `path.resolve(_dirname, "..", "templates",
 *   "library")`, which assumed _dirname === server/services/. That
 *   holds under tsx in dev, but the PRODUCTION build is bundled by
 *   esbuild to dist/index.js and started as `node dist/index.js`, so
 *   at runtime import.meta.url → /opt/render/project/src/dist/, and
 *   "../templates/library" resolved to
 *   /opt/render/project/src/templates/library — missing the `server/`
 *   segment. fs.existsSync failed, getTemplate() returned null, and
 *   every render died with "Unknown templateId: it-services/...".
 *
 * THE FIX
 *   Probe an ordered list of candidate roots and return the first that
 *   actually exists on disk. This is robust to the dev (tsx, _dirname =
 *   server/services) vs prod (bundled, _dirname = dist, cwd = repo
 *   root) split without hard-coding either layout. The
 *   TEMPLATE_LIBRARY_ROOT env override still wins when set, as the
 *   ultimate escape hatch for unusual environments.
 *
 * Result is memoised — the directory doesn't move at runtime and the
 * probe touches the filesystem.
 */
let _libraryRootCache: string | null = null;

function getLibraryRoot(): string {
  const override = process.env.TEMPLATE_LIBRARY_ROOT;
  if (override) return override;

  if (_libraryRootCache) return _libraryRootCache;

  // Ordered by specificity. cwd-based paths are the reliable ones in
  // the bundled production build (Render cwd = /opt/render/project/src);
  // _dirname-based paths keep tsx/test runs working.
  const candidates = [
    // Prod: `node dist/index.js` with cwd = repo root.
    path.resolve(process.cwd(), "server", "templates", "library"),
    // Some hosts set cwd elsewhere but keep the tree under dist's parent.
    path.resolve(_dirname, "..", "server", "templates", "library"),
    // Dev (tsx): _dirname = server/services → ../templates/library.
    path.resolve(_dirname, "..", "templates", "library"),
    // Bundled but templates copied next to dist (defensive).
    path.resolve(_dirname, "templates", "library"),
    // Last-ditch: cwd directly.
    path.resolve(process.cwd(), "templates", "library"),
  ];

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
        _libraryRootCache = candidate;
        console.log("[templateLibrary] library root resolved:", candidate);
        return candidate;
      }
    } catch {
      // Ignore and try the next candidate.
    }
  }

  // Nothing found — return the prod-canonical path so the eventual
  // ENOENT error message points somewhere meaningful, and log loudly.
  const fallback = candidates[0];
  console.error(
    "[templateLibrary] LIBRARY ROOT NOT FOUND. Probed:\n" +
      candidates.map((c) => "  - " + c).join("\n") +
      "\nFalling back to: " + fallback +
      "\nSet TEMPLATE_LIBRARY_ROOT to override.",
  );
  return fallback;
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
/**
 * Map a trade-preset string (as stored on organizations.tradePreset or
 * users.defaultTradeSector) to a template sector id. Returns null when
 * the sector has no designs of its own, so the caller can fall back.
 *
 * Delivery 2.14 Chunk 1 — THIS FUNCTION USED TO BE BROKEN. It matched
 * on hyphenated ids ("commercial-cleaning") while every stored value is
 * underscored ("commercial_cleaning"), so every one of the 25 trade
 * presets fell through to the default and three sectors' worth of
 * finished designs were unreachable from the sector default. It now
 * delegates to the shared vocabulary, which normalises underscores and
 * carries the historical aliases — including "website-marketing", the
 * one that the picker's own copy was also missing.
 *
 * Kept as a named export so existing call sites are unchanged.
 */
export function tradePresetToSector(tradePreset: string | null | undefined): SectorId | null {
  return templateSectorFor(tradePreset);
}

/**
 * Same, but never null: applies the default sector when the preset has
 * no designs of its own. Prefer this at render time, where a proposal
 * always needs a design.
 */
export function tradePresetToSectorOrDefault(
  tradePreset: string | null | undefined,
): SectorId {
  return resolveTemplateSector(tradePreset);
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
