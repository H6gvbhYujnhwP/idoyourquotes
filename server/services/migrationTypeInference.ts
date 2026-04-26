/**
 * server/services/migrationTypeInference.ts
 *
 * Phase 4A Delivery 25 — Project / Migration migration-type inference.
 *
 * Pure synchronous helper called from inside the generateDraft mutation
 * (after AI parse, before commit). Looks at the same evidence the AI
 * already saw plus the AI's own line items, title, and description, and
 * returns a guess at the migration profile when the evidence supports
 * one. The guess is written to quotes.migrationTypeSuggested as advisory
 * data — the user-confirmed value lives in quotes.migrationType, written
 * by the review-gate UI in Delivery 26.
 *
 * Design constraints (signed off in design conversation):
 *
 *   1. Action verb required. Pure procurement language ("we need 12
 *      M365 licences") must NOT trigger a migration guess. The product
 *      keyword (e.g. "M365") must co-occur with at least one migration
 *      action verb (migrate, cutover, transition, decommission, etc.)
 *      before any guess is returned.
 *
 *   2. Surface uncertainty, never silent default. The renderer never
 *      reads from migrationTypeSuggested; only the review-gate UI reads
 *      it and surfaces it as a hint ("This looks like an M365
 *      migration"). The user must explicitly confirm by picking the
 *      type in the review gate before the renderer will render the
 *      migration appendix.
 *
 *   3. Cross-vendor disambiguation. Both Microsoft AND Google product
 *      keywords present together in the same evidence → 'tenant'
 *      (cross-vendor migration). A single platform's keywords →
 *      'm365' or 'workspace' alone. Server keywords without cloud
 *      keywords → 'server'.
 *
 * Pure function. No I/O, no async, no side effects, no logging from
 * inside this file — the caller is responsible for any logging it wants.
 */

export type MigrationType = "server" | "m365" | "workspace" | "tenant";

export type Confidence = "high" | "medium" | "low";

export interface InferenceInput {
  /**
   * Concatenated evidence string. Typically the same string the
   * generateDraft mutation built as `processedEvidence.join("\n")`.
   * Voice dictations, PDFs, images, emails, text notes — all the raw
   * input the AI saw.
   */
  evidence: string;
  /**
   * AI-generated line item descriptions from the just-completed draft.
   * Provides extra signal beyond the evidence (e.g. "Exchange Online
   * mailbox migration" appearing as a line item the AI inferred from
   * fuzzier source text).
   */
  lineItemDescriptions: string[];
  /** AI-generated quote title, if any. */
  title: string | null;
  /** AI-generated quote description, if any. */
  description: string | null;
}

export interface InferenceResult {
  /**
   * The inferred migration profile, or null when the evidence does not
   * support any guess (no migration signal, or signal too weak after
   * the action-verb gate).
   */
  guess: MigrationType | null;
  /**
   * Confidence level — used by the Delivery 26 review gate to soften
   * or strengthen the hint copy. 'low' is also returned alongside a
   * non-null guess in marginal cases; the UI should still treat the
   * dropdown as unselected until the user confirms.
   */
  confidence: Confidence;
}

// ── Keyword sets ─────────────────────────────────────────────────────

/**
 * Action verbs that signal migration WORK, not just product mention.
 * Without one of these in the evidence, the function returns
 * { guess: null, confidence: 'low' } regardless of how many product
 * keywords are present — that's the procurement-quote false positive
 * guard.
 */
const ACTION_VERBS: readonly string[] = [
  "migrate",
  "migration",
  "migrating",
  "migrated",
  "cutover",
  "cut over",
  "cut-over",
  "switch from",
  "switching from",
  "switched from",
  "transition from",
  "transitioning from",
  "transitioned from",
  "move from",
  "moving from",
  "moved from",
  "move to",
  "moving to",
  "decommission",
  "decommissioning",
  "rip and replace",
  "lift and shift",
  "lift-and-shift",
  "consolidate",
  "consolidating",
  "from on-prem",
  "from on prem",
  "from on premise",
  "from on-premise",
  "from on premises",
  "from on-premises",
  "to cloud",
  "to azure",
  "to aws",
  "to m365",
  "to microsoft 365",
  "to office 365",
  "to o365",
  "to sharepoint",
  "to workspace",
  "to google workspace",
  "tenant-to-tenant",
  "tenant to tenant",
  "cross-tenant",
];

/** Keywords that suggest a server migration. */
const SERVER_KEYWORDS: readonly string[] = [
  "server migration",
  "exchange server",
  "file server",
  "ad migration",
  "active directory migration",
  "domain controller",
  "on-prem server",
  "on prem server",
  "on-premise server",
  "on-premises server",
  "physical to virtual",
  "p2v",
  "v2v",
  "datacentre",
  "datacenter",
  "vm migration",
  "virtual machine migration",
  "azure migration",
  "aws migration",
  "hyper-v",
  "vmware",
  "esxi",
  "windows server",
  "linux server",
  "sql server migration",
  "database server migration",
];

/** Keywords that suggest a Microsoft 365 platform involvement. */
const M365_KEYWORDS: readonly string[] = [
  "m365",
  "microsoft 365",
  "office 365",
  "o365",
  "exchange online",
  "sharepoint online",
  "sharepoint",
  "onedrive",
  "onedrive for business",
  "microsoft teams",
  "ms teams",
  "azure ad",
  "azure active directory",
  "entra",
  "entra id",
  "outlook online",
  "exchange 365",
];

/** Keywords that suggest a Google Workspace platform involvement. */
const WORKSPACE_KEYWORDS: readonly string[] = [
  "google workspace",
  "g suite",
  "gsuite",
  "g-suite",
  "google apps",
  "gmail business",
  "google drive business",
  "google drive for business",
  "google calendar business",
  "google meet business",
  "google chat business",
];

/**
 * Keywords that explicitly signal a tenant-level (cross-vendor or
 * intra-vendor tenant) migration regardless of the platform mix. When
 * one of these appears alongside any product keywords, the result is
 * forced to 'tenant'.
 */
const TENANT_KEYWORDS: readonly string[] = [
  "tenant migration",
  "tenant to tenant",
  "tenant-to-tenant",
  "cross-tenant",
  "cross tenant",
  "intra-tenant",
  "intra tenant",
];

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Build the canonical lowercase haystack from inputs. Uses simple
 * concatenation with newline separators — the exact whitespace doesn't
 * matter, only that adjacent fields don't accidentally fuse keywords
 * across boundaries (e.g. a description ending "...Exchange" and a
 * line item starting "Online support..." must not match
 * "exchange online" by accident).
 */
function buildHaystack(input: InferenceInput): string {
  const parts: string[] = [];
  if (input.evidence) parts.push(input.evidence);
  for (const desc of input.lineItemDescriptions) {
    if (desc) parts.push(desc);
  }
  if (input.title) parts.push(input.title);
  if (input.description) parts.push(input.description);
  return parts.join("\n").toLowerCase();
}

/** Count how many distinct keywords from the set appear at least once. */
function countMatches(haystack: string, keywords: readonly string[]): number {
  let count = 0;
  for (const kw of keywords) {
    if (haystack.includes(kw)) count++;
  }
  return count;
}

// ── Main entry point ─────────────────────────────────────────────────

/**
 * Infer the migration profile, if any, that the evidence describes.
 *
 * Returns `{ guess: null, confidence: 'low' }` when:
 *   • the evidence is empty,
 *   • no migration action verb appears, or
 *   • product keywords are present but the action-verb gate fails
 *     (procurement quote false positive guard).
 *
 * Returns a guess + confidence otherwise. Confidence ladder:
 *   • high   — single platform unambiguously dominant, multiple
 *              keyword hits, action verb present.
 *   • medium — single platform leads but only 1–2 hits, or tenant
 *              triggered by mixed-platform mentions.
 *   • low    — minimal signal but enough to warrant a hint.
 */
export function inferMigrationType(input: InferenceInput): InferenceResult {
  const haystack = buildHaystack(input);
  if (!haystack.trim()) {
    return { guess: null, confidence: "low" };
  }

  // ── Action-verb gate (Fix 1) ──────────────────────────────────────
  // Without at least one migration action verb anywhere in the
  // haystack, this is procurement-or-something-else, not a migration.
  const hasActionVerb = ACTION_VERBS.some((v) => haystack.includes(v));
  if (!hasActionVerb) {
    return { guess: null, confidence: "low" };
  }

  const serverHits = countMatches(haystack, SERVER_KEYWORDS);
  const m365Hits = countMatches(haystack, M365_KEYWORDS);
  const workspaceHits = countMatches(haystack, WORKSPACE_KEYWORDS);
  const explicitTenant = TENANT_KEYWORDS.some((v) => haystack.includes(v));

  // ── Explicit tenant signal ────────────────────────────────────────
  // "tenant migration", "tenant-to-tenant", etc. force tenant
  // regardless of platform balance — the user has already named the
  // scenario.
  if (explicitTenant && (m365Hits > 0 || workspaceHits > 0 || serverHits > 0)) {
    return { guess: "tenant", confidence: "medium" };
  }

  // ── Cross-vendor disambiguation ───────────────────────────────────
  // Both M365 and Workspace product keywords present → cross-vendor
  // tenant migration. Confidence depends on how strong each side is.
  if (m365Hits > 0 && workspaceHits > 0) {
    const totalCloudHits = m365Hits + workspaceHits;
    const confidence: Confidence = totalCloudHits >= 4 ? "high" : "medium";
    return { guess: "tenant", confidence };
  }

  // ── Single-platform paths ─────────────────────────────────────────
  // M365 keywords present (and no Workspace) → M365 migration.
  // Server keywords are tolerated alongside M365 (e.g. "Exchange
  // server to Exchange Online") — we treat that as M365 since the
  // *target* is the cloud platform that defines the work.
  if (m365Hits > 0 && workspaceHits === 0) {
    const totalHits = m365Hits + serverHits;
    const confidence: Confidence =
      m365Hits >= 3 ? "high" : totalHits >= 2 ? "medium" : "low";
    return { guess: "m365", confidence };
  }

  // Workspace keywords present (and no M365) → Workspace migration.
  if (workspaceHits > 0 && m365Hits === 0) {
    const totalHits = workspaceHits + serverHits;
    const confidence: Confidence =
      workspaceHits >= 3 ? "high" : totalHits >= 2 ? "medium" : "low";
    return { guess: "workspace", confidence };
  }

  // ── Server-only path ──────────────────────────────────────────────
  // Server keywords with no platform keywords → on-prem-to-on-prem,
  // on-prem-to-Azure/AWS, hardware refresh, etc. All bucketed as
  // 'server'.
  if (serverHits > 0) {
    const confidence: Confidence =
      serverHits >= 3 ? "high" : serverHits >= 2 ? "medium" : "low";
    return { guess: "server", confidence };
  }

  // Action verb present but no recognisable product keywords. The
  // user's mentioned migration without naming a platform — we return
  // null rather than guess wrong.
  return { guess: null, confidence: "low" };
}
