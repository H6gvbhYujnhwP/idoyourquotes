/**
 * server/templates/migrationAppendix.ts
 *
 * Phase 4A Delivery 27 / 28 — Project / Migration appendix renderer.
 *
 * Reads the AI-suggested migration type from `quote.migrationTypeSuggested`
 * and, when a valid suggestion is present AND the quote is in the IT
 * Services sector, renders a single appendix page slotted between the
 * Pricing and Terms pages of the branded proposal.
 *
 * Two D28-specific rules:
 *
 *   1. **Read from `migrationTypeSuggested`, not `migrationType`.** The
 *      original D27 design routed the type through a review-gate UI
 *      that wrote the user-confirmed value into `migrationType`. That
 *      review gate was dropped — the appendix now fires automatically
 *      whenever the AI inference helper has written a value into
 *      `migrationTypeSuggested`. No user confirmation is required, no
 *      UI exists for it.
 *
 *   2. **Gated to `tradePreset === 'it_services'`.** Even when the AI
 *      inference happens to fire on a non-IT quote (e.g. a commercial
 *      cleaning quote whose evidence happens to mention the words
 *      "migrate" and "M365" in some unrelated context), the appendix
 *      will not render. Migrations are an MSP/IT motion only — none
 *      of the other three GTM sectors should ever see the appendix.
 *
 * Cascade per block (each of methodology / phases / assumptions /
 * risks / rollback / outOfScope):
 *
 *   quote.migrationX
 *     → organizations.default{Profile}{Block}     (Server | M365 | Workspace | Tenant)
 *     → defaultsFor(type).x                       (locked default content in migrationDefaults.ts)
 *
 * Hypercare days cascade (used to substitute the `{hypercareDays}` token
 * inside the resolved rollback narrative):
 *
 *   quote.hypercareDays → organizations.defaultHypercareDays → 14
 *
 * Per-template section header:
 *
 *   - Modern    → `.eyebrow` + `<h2>` (matches `01 — Executive Summary`,
 *                                       `02 — Pricing`).
 *   - Structured → `.sec-banner` (matches the banner used by the
 *                                  pricing and terms pages).
 *   - Bold      → `.sec-div` + `<h2>` (matches the bold editorial
 *                                       section divider).
 *
 * Body content uses generic markup (`<p>`, `<h3>`, `<ul class="term-list">`)
 * which is styled identically across all three templates' CSS, so the
 * appendix body inherits the visual rhythm of whichever template it
 * lands in without needing template-specific body markup.
 *
 * Pure function — no I/O, no async, no logging. Returns either an
 * empty string (gate failed, no suggested type, suggestion not in the
 * allowed set) or a single `<div class="page">…</div>` block ready to
 * be concatenated into the body of the proposal HTML.
 */

import type { Quote, Organization } from "../../drizzle/schema";
import {
  defaultsFor,
  DEFAULT_HYPERCARE_DAYS,
  type MigrationType,
  type MigrationProfileDefaults,
} from "./migrationDefaults";

// ── Public types ─────────────────────────────────────────────────────

export type AppendixTemplateStyle = "modern" | "structured" | "bold";

export interface RenderMigrationAppendixArgs {
  quote: Quote;
  organization: Organization | null | undefined;
  /** Which template chrome to wrap the appendix in. */
  templateStyle: AppendixTemplateStyle;
  /**
   * The section number to display in the header. Caller passes the
   * number that the appendix should occupy (typically 3, with the
   * Terms page shifting from 3 → 4 when the appendix renders).
   */
  sectionNumber: number;
  /** Shared page-footer HTML, identical to what other pages use. */
  pageFooter: string;
}

// ── HTML escape (local copy — appendix can't import from parent
//    renderer because the parent imports the template files which
//    import this file; would create a circular dependency) ──────────

function escapeHtml(input: unknown): string {
  return String(input ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ── Type narrowing ───────────────────────────────────────────────────

/**
 * D28: read the AI-suggested type, not the user-confirmed one. Only
 * the four enum values land in this column; anything else is treated
 * as "no suggestion" and the appendix is skipped.
 */
function normaliseMigrationType(raw: unknown): MigrationType | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim().toLowerCase();
  if (v === "server" || v === "m365" || v === "workspace" || v === "tenant") {
    return v;
  }
  return null;
}

// ── Cascade resolvers ────────────────────────────────────────────────

type Block = keyof MigrationProfileDefaults;

const BLOCKS: Block[] = [
  "methodology",
  "phases",
  "assumptions",
  "risks",
  "rollback",
  "outOfScope",
];

const QUOTE_COL: Record<Block, string> = {
  methodology: "migrationMethodology",
  phases: "migrationPhases",
  assumptions: "migrationAssumptions",
  risks: "migrationRisks",
  rollback: "migrationRollback",
  outOfScope: "migrationOutOfScope",
};

const BLOCK_TITLE: Record<Block, string> = {
  methodology: "Methodology",
  phases: "Phases",
  assumptions: "Assumptions",
  risks: "Risks",
  rollback: "Rollback",
  outOfScope: "OutOfScope",
};

const PROFILE_TITLE: Record<MigrationType, string> = {
  server: "Server",
  m365: "M365",
  workspace: "Workspace",
  tenant: "Tenant",
};

function orgColumnName(type: MigrationType, block: Block): string {
  return `default${PROFILE_TITLE[type]}${BLOCK_TITLE[block]}`;
}

function resolveBlock(
  quote: Quote,
  organization: Organization | null | undefined,
  type: MigrationType,
  block: Block,
): string {
  // 1. Per-quote override.
  const v1 = (quote as any)[QUOTE_COL[block]];
  if (typeof v1 === "string" && v1.trim()) return v1;

  // 2. Org-level default for this profile + block.
  if (organization) {
    const v2 = (organization as any)[orgColumnName(type, block)];
    if (typeof v2 === "string" && v2.trim()) return v2;
  }

  // 3. Hard-coded default content.
  return defaultsFor(type)[block];
}

function resolveHypercareDays(
  quote: Quote,
  organization: Organization | null | undefined,
): number {
  const q = (quote as any).hypercareDays;
  if (Number.isFinite(q) && Number(q) > 0) return Math.round(Number(q));

  const o = (organization as any)?.defaultHypercareDays;
  if (Number.isFinite(o) && Number(o) > 0) return Math.round(Number(o));

  return DEFAULT_HYPERCARE_DAYS;
}

// ── Block formatters ─────────────────────────────────────────────────

/**
 * Phases: each line in the source content is one phase, formatted
 * "N. Title — sub-items, sub-items". The leading enumerator is
 * already part of the source text, so we render each line as its own
 * `<p>` with no extra list chrome — keeps the verbatim formatting and
 * avoids double-bulleting (a `<ol>` would put a marker before "1.").
 */
function renderPhases(raw: string): string {
  const lines = raw.split("\n").map((s) => s.trim()).filter(Boolean);
  if (lines.length === 0) return "";
  return lines.map((line) => `<p class="appendix-phase">${escapeHtml(line)}</p>`).join("");
}

/**
 * Assumptions / out-of-scope: hyphen-prefixed bullet list. Strip the
 * leading "- " marker and render as a `<ul class="term-list">` — the
 * `term-list` class is defined identically in all three templates'
 * CSS (8px top/bottom margin, 20px left padding, 5px gap between
 * items), so the appendix bullets line up with the bullets on the
 * Terms page.
 */
function renderBulletList(raw: string): string {
  const items = raw
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => (s.startsWith("- ") ? s.slice(2) : s));
  if (items.length === 0) return "";
  return `<ul class="term-list">${items
    .map((s) => `<li>${escapeHtml(s)}</li>`)
    .join("")}</ul>`;
}

/**
 * Risks: alternating "- Risk: ..." / "  Mitigation: ..." pairs.
 * Walk the lines and group each consecutive Risk/Mitigation pair into
 * a single `<li>` with both lines, each prefixed by a strong label.
 * Lines that don't fit the pattern fall through as their own bullet
 * (defensive — the locked default content always pairs cleanly, but
 * an org or per-quote override might not).
 */
function renderRisks(raw: string): string {
  const lines = raw.split("\n").map((s) => s).filter((s) => s.trim());
  if (lines.length === 0) return "";

  const items: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    const riskMatch = line.match(/^-?\s*Risk:\s*(.*)$/i);
    if (riskMatch) {
      const riskText = riskMatch[1];
      // Look ahead for a Mitigation line.
      const next = (lines[i + 1] || "").trim();
      const mitigationMatch = next.match(/^-?\s*Mitigation:\s*(.*)$/i);
      if (mitigationMatch) {
        items.push(
          `<li><strong>Risk:</strong> ${escapeHtml(riskText)}` +
            `<br/><strong>Mitigation:</strong> ${escapeHtml(mitigationMatch[1])}</li>`,
        );
        i += 2;
        continue;
      }
      // Risk with no mitigation pair — render as just a risk.
      items.push(`<li><strong>Risk:</strong> ${escapeHtml(riskText)}</li>`);
      i += 1;
      continue;
    }
    // Not a Risk line — render verbatim, stripping any leading "- ".
    const cleaned = line.startsWith("- ") ? line.slice(2) : line;
    items.push(`<li>${escapeHtml(cleaned)}</li>`);
    i += 1;
  }
  return `<ul class="term-list">${items.join("")}</ul>`;
}

// ── Per-template section header ──────────────────────────────────────

function renderSectionHeader(
  templateStyle: AppendixTemplateStyle,
  sectionNumber: number,
  profileTitle: string,
): string {
  const num = String(sectionNumber).padStart(2, "0");
  const title = "Migration &amp; Project Plan";

  if (templateStyle === "modern") {
    return `<div class="eyebrow">${num} — ${title}</div>
  <h2>${escapeHtml(profileTitle)} migration plan</h2>`;
  }

  if (templateStyle === "structured") {
    return `<div class="sec-banner"><span class="sec-num">${num}</span><span class="sec-title">${title}</span></div>`;
  }

  // bold
  return `<div class="sec-div"><span class="div-num">${num}</span><span class="div-title">${title}</span><div class="div-line"></div></div>
  <h2>The Plan</h2>`;
}

const PROFILE_HEADING: Record<MigrationType, string> = {
  server: "Server",
  m365: "Microsoft 365",
  workspace: "Google Workspace",
  tenant: "Tenant",
};

// ── Public renderer ──────────────────────────────────────────────────

export function renderMigrationAppendix(args: RenderMigrationAppendixArgs): string {
  const { quote, organization, templateStyle, sectionNumber, pageFooter } = args;

  // D28 gate 1: IT Services only. No other GTM sector ever shows the
  // appendix, even if the AI inference helper happens to fire on
  // unrelated evidence.
  if ((quote as any).tradePreset !== "it_services") return "";

  // D28 gate 2: read the AI-suggested type. No suggestion (or an
  // unexpected value in the column) means no appendix.
  const type = normaliseMigrationType((quote as any).migrationTypeSuggested);
  if (!type) return "";

  // Resolve the six narrative blocks via cascade.
  const resolved: Record<Block, string> = {
    methodology: "",
    phases: "",
    assumptions: "",
    risks: "",
    rollback: "",
    outOfScope: "",
  };
  for (const block of BLOCKS) {
    resolved[block] = resolveBlock(quote, organization, type, block);
  }

  // Hypercare days substitution into the rollback narrative.
  const hypercareDays = resolveHypercareDays(quote, organization);
  const rollbackText = resolved.rollback.replace(/\{hypercareDays\}/g, String(hypercareDays));

  const header = renderSectionHeader(templateStyle, sectionNumber, PROFILE_HEADING[type]);

  return `
<div class="page">
  ${header}
  <h3>Methodology</h3>
  <p>${escapeHtml(resolved.methodology)}</p>

  <h3>Phases</h3>
  ${renderPhases(resolved.phases)}

  <h3>Assumptions</h3>
  ${renderBulletList(resolved.assumptions)}

  <h3>Risks &amp; Mitigations</h3>
  ${renderRisks(resolved.risks)}

  <h3>Rollback &amp; Hypercare</h3>
  <p>${escapeHtml(rollbackText)}</p>

  <h3>Out of Scope</h3>
  ${renderBulletList(resolved.outOfScope)}

  ${pageFooter}
</div>`;
}
