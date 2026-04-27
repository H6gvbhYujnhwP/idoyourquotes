/**
 * ReviewBeforeGenerateModal.tsx
 *
 * Phase 4A — Delivery 24 (initial), Delivery 29 (migration sections),
 * Delivery 34 (this delivery).
 *
 * What this modal does
 * --------------------
 *   1. Shows the user every field that ends up on the PDF for the
 *      mode they're generating, with inline read-only paragraphs.
 *   2. Lets them toggle Edit on any section to tweak per-quote.
 *   3. Surfaces a "save as default" checkbox on sections that have a
 *      per-mode default column. Ticking it on a per-section Save
 *      eagerly writes to organizations.{branded,default}X so it pre-
 *      populates the next quote of the same mode. Save-as-default in
 *      Quick mode does NOT bleed into Branded mode and vice versa —
 *      the columns are physically separate.
 *
 * Delivery 34 — save & dismissal semantics
 * ----------------------------------------
 *   The modal previously dismissed on overlay click and lost any
 *   in-flight per-section edits, and the save-as-default tick was
 *   only ever consumed at the modal-level Generate. D34 reworks both:
 *
 *     - Outside-click is a no-op. The only ways to close the modal
 *       are the × button, the bottom Close button, Esc, or Generate.
 *     - All four close paths first commit any pending per-quote and
 *       org-default writes — there is no "discard everything" exit.
 *     - Each editable section now has its own Save and Cancel buttons
 *       in a footer row alongside a "Save as default" tick. Per-section
 *       Save eagerly writes to org defaults when the tick is on (one
 *       updateProfile call per section), then closes the editor.
 *       Per-section Cancel reverts the textarea to its initial value
 *       and closes the editor.
 *     - The "Save as default" tick is now visible the whole time the
 *       editor is open — not gated on dirty — so the affordance is
 *       discoverable before any typing happens.
 *     - Save-as-default coverage extended to all six migration
 *       sections. The active migration profile is resolved once from
 *       migrationTypeSuggested and used to pick the matching
 *       default{Server|M365|Workspace|Tenant}{Section} column.
 *
 * Section list per mode
 * ---------------------
 *   "quick" (Quick Quote):
 *     - Terms & conditions          (quote.terms,            default: defaultTerms)
 *     - Exclusions                  (tenderContext.exclusions, default: defaultExclusions)
 *     - Assumptions                 (tenderContext.assumptions, no default)
 *
 *   "branded" (Contract/Tender):
 *     - Executive summary lead      (tenderContext.notes,      no default)
 *     - Terms & conditions          (quote.terms,              default: brandedTerms)
 *     - Exclusions                  (tenderContext.exclusions, default: brandedExclusions)
 *     - Assumptions                 (tenderContext.assumptions, no default)
 *     - Valid until                 (quote.validUntil,         no default)
 *     - Payment terms               (quote.paymentTerms,       default: brandedPaymentTerms)
 *     - Signatory name              (quote.signatoryName,      default: brandedSignatoryName)
 *     - Signatory position          (quote.signatoryPosition,  default: brandedSignatoryPosition)
 *     - Migration sections (×6)     (quote.migrationX,         default: default{Profile}{Section})
 *
 * Mutation order on confirm / close
 * ---------------------------------
 *   1. quotes.update           — if any per-quote field is dirty
 *   2. tenderContext.upsert    — if notes/assumptions/exclusions dirty
 *   3. auth.updateProfile      — if any save-as-default is still
 *                                pending (per-section Save resets the
 *                                tick after writing eagerly, so this
 *                                only fires for sections the user
 *                                ticked but never explicitly Saved
 *                                before closing).
 *   All three fire in parallel; if any fails, the modal stays open and
 *   surfaces the error inline so edits aren't lost.
 *
 *   onConfirm() is called only after Generate-path saves resolve.
 *   The Close paths (× / bottom Close / Esc) run the same writes but
 *   skip onConfirm() — the parent stays where it is.
 */
import { useState, useEffect, useMemo } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AlertCircle, Check, Download, Loader2, Pencil } from "lucide-react";
import { brand } from "@/lib/brandTheme";
import {
  defaultsFor,
  type MigrationType,
  type MigrationProfileDefaults,
  DEFAULT_HYPERCARE_DAYS,
} from "@shared/migrationDefaults";

// ─── Types ────────────────────────────────────────────────────────────────

export type ReviewMode = "quick" | "branded";

type AssumptionOrExclusion = { text: string; confirmed: boolean };

interface OrgDefaults {
  // Quick Quote defaults — the original default* family on organizations.
  defaultTerms?: string | null;
  defaultExclusions?: string | null;
  // Branded-mode defaults — added in Delivery 24.
  brandedTerms?: string | null;
  brandedExclusions?: string | null;
  brandedPaymentTerms?: string | null;
  brandedSignatoryName?: string | null;
  brandedSignatoryPosition?: string | null;
  // Cross-mode defaults — read for cascade fall-through.
  defaultPaymentTerms?: string | null;
  defaultSignatoryName?: string | null;
  defaultSignatoryPosition?: string | null;
  // Phase 4A Delivery 29 — per-profile migration defaults. The modal's
  // three-tier cascade for migration sections reads these as tier 2
  // (between quote.migrationX at tier 1 and the locked content from
  // shared/migrationDefaults at tier 3). Editing these globally is a
  // D30 Settings job; D29 only reads them.
  defaultHypercareDays?: number | null;
  defaultServerMethodology?: string | null;
  defaultServerPhases?: string | null;
  defaultServerAssumptions?: string | null;
  defaultServerRisks?: string | null;
  defaultServerRollback?: string | null;
  defaultServerOutOfScope?: string | null;
  defaultM365Methodology?: string | null;
  defaultM365Phases?: string | null;
  defaultM365Assumptions?: string | null;
  defaultM365Risks?: string | null;
  defaultM365Rollback?: string | null;
  defaultM365OutOfScope?: string | null;
  defaultWorkspaceMethodology?: string | null;
  defaultWorkspacePhases?: string | null;
  defaultWorkspaceAssumptions?: string | null;
  defaultWorkspaceRisks?: string | null;
  defaultWorkspaceRollback?: string | null;
  defaultWorkspaceOutOfScope?: string | null;
  defaultTenantMethodology?: string | null;
  defaultTenantPhases?: string | null;
  defaultTenantAssumptions?: string | null;
  defaultTenantRisks?: string | null;
  defaultTenantRollback?: string | null;
  defaultTenantOutOfScope?: string | null;
}

interface ReviewBeforeGenerateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quoteId: number;
  mode: ReviewMode;
  // Initial per-quote values — pulled from quote / fullQuote on the
  // workspace. Optional because a freshly-generated quote may have any
  // of these blank.
  initialTerms?: string | null;
  initialAssumptions?: AssumptionOrExclusion[] | null;
  initialExclusions?: AssumptionOrExclusion[] | null;
  initialNotes?: string | null;
  initialValidUntil?: Date | string | null;
  initialPaymentTerms?: string | null;
  initialSignatoryName?: string | null;
  initialSignatoryPosition?: string | null;
  // Phase 4A Delivery 29 — per-quote migration overrides + the gate
  // inputs. The 6 migration sections only render in branded mode AND
  // only when both `tradePreset === 'it_services'` and
  // `migrationTypeSuggested` is one of the four valid types — same
  // gate as the renderer (see server/templates/migrationAppendix.ts).
  // For other quotes the modal looks identical to pre-D29.
  tradePreset?: string | null;
  migrationTypeSuggested?: string | null;
  initialMigrationMethodology?: string | null;
  initialMigrationPhases?: string | null;
  initialMigrationAssumptions?: string | null;
  initialMigrationRisks?: string | null;
  initialMigrationRollback?: string | null;
  initialMigrationOutOfScope?: string | null;
  initialHypercareDays?: number | null;
  // Organization defaults — used for cascade fallback when per-quote
  // values are blank, so the modal shows what the renderer would
  // actually produce.
  orgDefaults?: OrgDefaults;
  // Fired AFTER any edited sections have been saved successfully.
  onConfirm: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function listToText(items: AssumptionOrExclusion[] | null | undefined): string {
  if (!items || items.length === 0) return "";
  return items.map((i) => i.text).join("\n");
}

function textToList(s: string): AssumptionOrExclusion[] {
  return s
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((text) => ({ text, confirmed: false }));
}

/** Format a Date for the native <input type="date">. */
function dateToInputValue(d: Date | string | null | undefined): string {
  if (!d) return "";
  const dt = typeof d === "string" ? new Date(d) : d;
  if (isNaN(dt.getTime())) return "";
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function inputValueToDate(s: string): Date | null {
  if (!s) return null;
  const dt = new Date(`${s}T00:00:00`);
  return isNaN(dt.getTime()) ? null : dt;
}

/**
 * Resolve a section's initial display value via the cascade chain. The
 * modal shows what the renderer would produce, not the raw per-quote
 * value (which may be blank when the renderer is filling from defaults).
 */
function cascade(
  perQuote: string | null | undefined,
  brandedDefault: string | null | undefined,
  legacyDefault: string | null | undefined,
): string {
  return (
    (perQuote && perQuote.trim() && perQuote)
    || (brandedDefault && brandedDefault.trim() && brandedDefault)
    || (legacyDefault && legacyDefault.trim() && legacyDefault)
    || ""
  );
}

// Section ids used as keys for state and switch dispatch.
type SectionId =
  | "notes"
  | "terms"
  | "exclusions"
  | "assumptions"
  | "validUntil"
  | "paymentTerms"
  | "signatoryName"
  | "signatoryPosition"
  // Phase 4A Delivery 29 — six migration appendix blocks. Only
  // appended to BRANDED_SECTIONS when the gate fires (see helper
  // `appendixBlocksFor` below).
  | "migrationMethodology"
  | "migrationPhases"
  | "migrationAssumptions"
  | "migrationRisks"
  | "migrationRollback"
  | "migrationOutOfScope";

interface SectionMeta {
  id: SectionId;
  label: string;
  emptyPlaceholder: string;
  // Whether the section supports a save-as-default affordance.
  hasDefaultOption: boolean;
  // Multi-line editor (textarea) vs single-line (input).
  multiline: boolean;
  // Bullet list rendering (one item per line).
  bulletRender?: boolean;
  // Render as a date picker rather than text.
  isDate?: boolean;
  minHeight?: string;
}

// Section registry — drives both rendering and save logic. The
// per-mode order arrays at the bottom are the only mode-aware part.
const SECTION_META: Record<SectionId, SectionMeta> = {
  notes: {
    id: "notes",
    label: "Executive summary lead",
    emptyPlaceholder:
      "No summary set. Click Edit to add the lead paragraph that opens the proposal.",
    hasDefaultOption: false,
    multiline: true,
    minHeight: "100px",
  },
  terms: {
    id: "terms",
    label: "Terms & conditions",
    emptyPlaceholder: "No terms set. Click Edit to add.",
    hasDefaultOption: true,
    multiline: true,
    minHeight: "120px",
  },
  exclusions: {
    id: "exclusions",
    label: "Exclusions",
    emptyPlaceholder:
      "No exclusions set. Click Edit to add — one per line.",
    hasDefaultOption: true,
    multiline: true,
    bulletRender: true,
    minHeight: "100px",
  },
  assumptions: {
    id: "assumptions",
    label: "Assumptions",
    emptyPlaceholder:
      "No assumptions set. Click Edit to add — one per line.",
    hasDefaultOption: false,
    multiline: true,
    bulletRender: true,
    minHeight: "100px",
  },
  validUntil: {
    id: "validUntil",
    label: "Valid until",
    emptyPlaceholder:
      "No date set. Click Edit to pick — defaults to your validity-days setting.",
    hasDefaultOption: false,
    multiline: false,
    isDate: true,
  },
  paymentTerms: {
    id: "paymentTerms",
    label: "Payment terms",
    emptyPlaceholder: "No payment terms set. Click Edit to add.",
    hasDefaultOption: true,
    multiline: true,
    minHeight: "70px",
  },
  signatoryName: {
    id: "signatoryName",
    label: "Signatory name",
    emptyPlaceholder: "No signatory set. Click Edit to add.",
    hasDefaultOption: true,
    multiline: false,
  },
  signatoryPosition: {
    id: "signatoryPosition",
    label: "Signatory position",
    emptyPlaceholder: "No position set. Click Edit to add.",
    hasDefaultOption: true,
    multiline: false,
  },
  // Phase 4A Delivery 29 — Migration appendix sections. Read-only view
  // shows the actual content the renderer will emit (per-quote override
  // → org default → locked content from shared/migrationDefaults).
  // Editing pre-fills with that same content; saving writes to the
  // matching quote.migrationX column.
  //
  // Phase 4A Delivery 34 — hasDefaultOption flipped to true on all
  // six migration sections. The org-default columns already exist
  // (defaultServer*, defaultM365*, defaultWorkspace*, defaultTenant*
  // — added in D27) and the active profile is resolved once from
  // migrationTypeSuggested in migrationOrgKey() below. The handler
  // chain reuses the same auth.updateProfile mutation as the rest
  // of the save-as-default sections.
  migrationMethodology: {
    id: "migrationMethodology",
    label: "Migration — methodology",
    emptyPlaceholder: "Click Edit to customise the methodology paragraph for this quote.",
    hasDefaultOption: true,
    multiline: true,
    minHeight: "120px",
  },
  migrationPhases: {
    id: "migrationPhases",
    label: "Migration — phases",
    emptyPlaceholder: "Click Edit to customise the project phases for this quote.",
    hasDefaultOption: true,
    multiline: true,
    minHeight: "140px",
  },
  migrationAssumptions: {
    id: "migrationAssumptions",
    label: "Migration — assumptions",
    emptyPlaceholder: "Click Edit to customise the migration assumptions for this quote — one per line.",
    hasDefaultOption: true,
    multiline: true,
    bulletRender: true,
    minHeight: "140px",
  },
  migrationRisks: {
    id: "migrationRisks",
    label: "Migration — risks & mitigations",
    emptyPlaceholder: "Click Edit to customise the risk / mitigation pairs for this quote.",
    hasDefaultOption: true,
    multiline: true,
    minHeight: "180px",
  },
  migrationRollback: {
    id: "migrationRollback",
    label: "Migration — rollback & hypercare",
    emptyPlaceholder: "Click Edit to customise the rollback narrative for this quote.",
    hasDefaultOption: true,
    multiline: true,
    minHeight: "120px",
  },
  migrationOutOfScope: {
    id: "migrationOutOfScope",
    label: "Migration — out of scope",
    emptyPlaceholder: "Click Edit to customise the migration out-of-scope list — one per line.",
    hasDefaultOption: true,
    multiline: true,
    bulletRender: true,
    minHeight: "140px",
  },
};

// Phase 4A Delivery 29 — gate helper. Returns the migration block ids
// in render order when the AI has inferred a migration AND the quote is
// in the IT Services sector. Empty array otherwise — same gate as the
// renderer in server/templates/migrationAppendix.ts.
const MIGRATION_SECTIONS: SectionId[] = [
  "migrationMethodology",
  "migrationPhases",
  "migrationAssumptions",
  "migrationRisks",
  "migrationRollback",
  "migrationOutOfScope",
];

function normaliseMigrationType(raw: unknown): MigrationType | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim().toLowerCase();
  if (v === "server" || v === "m365" || v === "workspace" || v === "tenant") {
    return v;
  }
  return null;
}

function appendixBlocksFor(
  tradePreset: string | null | undefined,
  migrationTypeSuggested: string | null | undefined,
): SectionId[] {
  if (tradePreset !== "it_services") return [];
  const t = normaliseMigrationType(migrationTypeSuggested);
  if (!t) return [];
  return MIGRATION_SECTIONS;
}

// Maps a migration section id to (a) the per-quote column read for
// tier 1 of the cascade and (b) the function that returns the right
// per-profile org column for tier 2. Tier 3 is always the locked
// content from shared/migrationDefaults via defaultsFor(type).
const MIGRATION_BLOCK_KEY: Record<
  Extract<SectionId, `migration${string}`>,
  keyof MigrationProfileDefaults
> = {
  migrationMethodology: "methodology",
  migrationPhases: "phases",
  migrationAssumptions: "assumptions",
  migrationRisks: "risks",
  migrationRollback: "rollback",
  migrationOutOfScope: "outOfScope",
};

function profileDefaultsKey(
  type: MigrationType,
  block: keyof MigrationProfileDefaults,
): keyof OrgDefaults {
  const profilePart =
    type === "server"
      ? "Server"
      : type === "m365"
      ? "M365"
      : type === "workspace"
      ? "Workspace"
      : "Tenant";
  const blockPart =
    block === "methodology"
      ? "Methodology"
      : block === "phases"
      ? "Phases"
      : block === "assumptions"
      ? "Assumptions"
      : block === "risks"
      ? "Risks"
      : block === "rollback"
      ? "Rollback"
      : "OutOfScope";
  return `default${profilePart}${blockPart}` as keyof OrgDefaults;
}

// Three-tier cascade for migration sections: per-quote override →
// per-profile org default → locked content. Returns the string the
// renderer would emit, with the {hypercareDays} token left literal —
// the read-only and edit views both show it verbatim, with a hint
// underneath the rollback section explaining the substitution.
function resolveMigrationBlock(
  block: keyof MigrationProfileDefaults,
  type: MigrationType,
  perQuote: string | null | undefined,
  orgDefaults: OrgDefaults | undefined,
): string {
  if (typeof perQuote === "string" && perQuote.trim()) return perQuote;
  if (orgDefaults) {
    const orgVal = orgDefaults[profileDefaultsKey(type, block)] as
      | string
      | null
      | undefined;
    if (typeof orgVal === "string" && orgVal.trim()) return orgVal;
  }
  return defaultsFor(type)[block];
}

// Friendly label for the inferred migration type — used in the
// rollback hint and (later) D30 Settings.
function profileLabel(type: MigrationType): string {
  return type === "server"
    ? "Server"
    : type === "m365"
    ? "Microsoft 365"
    : type === "workspace"
    ? "Google Workspace"
    : "Tenant";
}

const QUICK_SECTIONS: SectionId[] = ["terms", "exclusions", "assumptions"];
const BRANDED_SECTIONS: SectionId[] = [
  "notes",
  "terms",
  "exclusions",
  "assumptions",
  "validUntil",
  "paymentTerms",
  "signatoryName",
  "signatoryPosition",
];

// ─── Component ────────────────────────────────────────────────────────────

export default function ReviewBeforeGenerateModal({
  open,
  onOpenChange,
  quoteId,
  mode,
  initialTerms,
  initialAssumptions,
  initialExclusions,
  initialNotes,
  initialValidUntil,
  initialPaymentTerms,
  initialSignatoryName,
  initialSignatoryPosition,
  tradePreset,
  migrationTypeSuggested,
  initialMigrationMethodology,
  initialMigrationPhases,
  initialMigrationAssumptions,
  initialMigrationRisks,
  initialMigrationRollback,
  initialMigrationOutOfScope,
  initialHypercareDays,
  orgDefaults,
  onConfirm,
}: ReviewBeforeGenerateModalProps) {
  // Phase 4A Delivery 29 — derive migration profile + gated section
  // list. When the gate fires we append the 6 migration sections to
  // the branded list. Quick mode is unaffected.
  const migrationProfile = useMemo(
    () => normaliseMigrationType(migrationTypeSuggested),
    [migrationTypeSuggested],
  );
  const migrationSectionIds = useMemo(
    () => appendixBlocksFor(tradePreset, migrationTypeSuggested),
    [tradePreset, migrationTypeSuggested],
  );

  const sectionIds =
    mode === "branded"
      ? [...BRANDED_SECTIONS, ...migrationSectionIds]
      : QUICK_SECTIONS;

  // Compute initial display values via cascade for each section. This
  // is what the renderer would emit today; the modal shows it as the
  // status quo and the user edits diff against it.
  const initial = useMemo(() => {
    const od = orgDefaults || {};
    // Phase 4A Delivery 29 — three-tier migration cascade. When no
    // migration profile is inferred (gate not fired), all six migration
    // initials are empty strings — they're not rendered anyway, but
    // keeping the keys present keeps the state objects shape-stable.
    const mp = migrationProfile;
    const migration = mp
      ? {
          migrationMethodology: resolveMigrationBlock(
            "methodology",
            mp,
            initialMigrationMethodology,
            od,
          ),
          migrationPhases: resolveMigrationBlock(
            "phases",
            mp,
            initialMigrationPhases,
            od,
          ),
          migrationAssumptions: resolveMigrationBlock(
            "assumptions",
            mp,
            initialMigrationAssumptions,
            od,
          ),
          migrationRisks: resolveMigrationBlock(
            "risks",
            mp,
            initialMigrationRisks,
            od,
          ),
          migrationRollback: resolveMigrationBlock(
            "rollback",
            mp,
            initialMigrationRollback,
            od,
          ),
          migrationOutOfScope: resolveMigrationBlock(
            "outOfScope",
            mp,
            initialMigrationOutOfScope,
            od,
          ),
        }
      : {
          migrationMethodology: "",
          migrationPhases: "",
          migrationAssumptions: "",
          migrationRisks: "",
          migrationRollback: "",
          migrationOutOfScope: "",
        };
    return {
      notes: initialNotes || "",
      terms: cascade(
        initialTerms,
        mode === "branded" ? od.brandedTerms : null,
        od.defaultTerms,
      ),
      exclusionsList: listToText(initialExclusions),
      // Exclusions cascade only kicks in when the per-quote tender-
      // context list is empty — matches the renderer.
      exclusionsFallback:
        listToText(initialExclusions) === ""
          ? cascade(
              null,
              mode === "branded" ? od.brandedExclusions : null,
              od.defaultExclusions,
            )
          : "",
      assumptionsList: listToText(initialAssumptions),
      validUntil: initialValidUntil
        ? typeof initialValidUntil === "string"
          ? new Date(initialValidUntil)
          : initialValidUntil
        : null,
      paymentTerms: cascade(
        initialPaymentTerms,
        mode === "branded" ? od.brandedPaymentTerms : null,
        od.defaultPaymentTerms,
      ),
      signatoryName: cascade(
        initialSignatoryName,
        mode === "branded" ? od.brandedSignatoryName : null,
        od.defaultSignatoryName,
      ),
      signatoryPosition: cascade(
        initialSignatoryPosition,
        mode === "branded" ? od.brandedSignatoryPosition : null,
        od.defaultSignatoryPosition,
      ),
      ...migration,
    };
  }, [
    mode,
    initialNotes,
    initialTerms,
    initialAssumptions,
    initialExclusions,
    initialValidUntil,
    initialPaymentTerms,
    initialSignatoryName,
    initialSignatoryPosition,
    migrationProfile,
    initialMigrationMethodology,
    initialMigrationPhases,
    initialMigrationAssumptions,
    initialMigrationRisks,
    initialMigrationRollback,
    initialMigrationOutOfScope,
    orgDefaults,
  ]);

  // Per-section editor state.
  const [values, setValues] = useState<Record<SectionId, string>>({
    notes: "",
    terms: "",
    exclusions: "",
    assumptions: "",
    validUntil: "",
    paymentTerms: "",
    signatoryName: "",
    signatoryPosition: "",
    migrationMethodology: "",
    migrationPhases: "",
    migrationAssumptions: "",
    migrationRisks: "",
    migrationRollback: "",
    migrationOutOfScope: "",
  });
  const [editing, setEditing] = useState<Record<SectionId, boolean>>({
    notes: false,
    terms: false,
    exclusions: false,
    assumptions: false,
    validUntil: false,
    paymentTerms: false,
    signatoryName: false,
    signatoryPosition: false,
    migrationMethodology: false,
    migrationPhases: false,
    migrationAssumptions: false,
    migrationRisks: false,
    migrationRollback: false,
    migrationOutOfScope: false,
  });
  const [saveAsDefault, setSaveAsDefault] = useState<Record<SectionId, boolean>>({
    notes: false,
    terms: false,
    exclusions: false,
    assumptions: false,
    validUntil: false,
    paymentTerms: false,
    signatoryName: false,
    signatoryPosition: false,
    migrationMethodology: false,
    migrationPhases: false,
    migrationAssumptions: false,
    migrationRisks: false,
    migrationRollback: false,
    migrationOutOfScope: false,
  });

  const [inlineError, setInlineError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Reset on open. Snapshot of initial values is held for the duration
  // of the open session so the parent's fullQuote refetching mid-review
  // doesn't wipe in-progress edits.
  //
  // Phase 4A Delivery 35.1 — `initial` is intentionally NOT in the
  // deps array. Pre-D35 the parent never refetched mid-session so
  // having it in deps was a no-op; D35 introduced invalidation after
  // every save, which made `initial` recompute mid-session and the
  // useEffect overwrite the user's typed text the moment a save
  // landed. The comment above describes the intended behaviour
  // (one-time snapshot on open) — this hook now matches it.
  useEffect(() => {
    if (!open) return;
    setValues({
      notes: initial.notes,
      terms: initial.terms,
      // Show the per-quote list when present, else the cascade fallback.
      // Editing the cascade fallback effectively forks the value into
      // the per-quote list — same behaviour as terms.
      exclusions: initial.exclusionsList || initial.exclusionsFallback,
      assumptions: initial.assumptionsList,
      validUntil: dateToInputValue(initial.validUntil),
      paymentTerms: initial.paymentTerms,
      signatoryName: initial.signatoryName,
      signatoryPosition: initial.signatoryPosition,
      migrationMethodology: initial.migrationMethodology,
      migrationPhases: initial.migrationPhases,
      migrationAssumptions: initial.migrationAssumptions,
      migrationRisks: initial.migrationRisks,
      migrationRollback: initial.migrationRollback,
      migrationOutOfScope: initial.migrationOutOfScope,
    });
    setEditing({
      notes: false,
      terms: false,
      exclusions: false,
      assumptions: false,
      validUntil: false,
      paymentTerms: false,
      signatoryName: false,
      signatoryPosition: false,
      migrationMethodology: false,
      migrationPhases: false,
      migrationAssumptions: false,
      migrationRisks: false,
      migrationRollback: false,
      migrationOutOfScope: false,
    });
    setSaveAsDefault({
      notes: false,
      terms: false,
      exclusions: false,
      assumptions: false,
      validUntil: false,
      paymentTerms: false,
      signatoryName: false,
      signatoryPosition: false,
      migrationMethodology: false,
      migrationPhases: false,
      migrationAssumptions: false,
      migrationRisks: false,
      migrationRollback: false,
      migrationOutOfScope: false,
    });
    setInlineError(null);
    setIsSaving(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const updateQuote = trpc.quotes.update.useMutation();
  const upsertTenderContext = trpc.tenderContext.upsert.useMutation();
  const updateProfile = trpc.auth.updateProfile.useMutation();

  // D34.1 — query invalidation. The parent (QuoteWorkspace) caches
  // both quotes.getFull (the per-quote source of every initialX prop
  // this modal consumes) and auth.orgProfile (the orgDefaults object).
  // Without explicit invalidation after a write, the parent keeps
  // serving stale props back into the modal on re-open and the user's
  // saved edit appears to vanish even though the database has it.
  // The pre-D34 modal got away with this because Generate was the
  // only exit and the PDF mutation that fired immediately afterwards
  // happened to refetch downstream queries; the new D34 close path
  // skips that mutation so we have to invalidate explicitly.
  const utils = trpc.useUtils();
  const invalidateAfterWrite = () => {
    void utils.quotes.getFull.invalidate({ id: quoteId });
    void utils.auth.orgProfile.invalidate();
  };

  // Compute dirty flags. A section is dirty when its current editor
  // value differs from what the modal opened with. Note that the
  // exclusions case needs care: editing an exclusions cascade fallback
  // (i.e. tenderContext was empty, the default got displayed) is
  // considered dirty against the per-quote initial empty value, which
  // is what we want — the edit should write into tenderContext for
  // this quote.
  const dirty = {
    notes: values.notes !== initial.notes,
    terms: values.terms !== initial.terms,
    exclusions:
      values.exclusions
      !== (initial.exclusionsList || initial.exclusionsFallback),
    assumptions: values.assumptions !== initial.assumptionsList,
    validUntil: values.validUntil !== dateToInputValue(initial.validUntil),
    paymentTerms: values.paymentTerms !== initial.paymentTerms,
    signatoryName: values.signatoryName !== initial.signatoryName,
    signatoryPosition:
      values.signatoryPosition !== initial.signatoryPosition,
    // Phase 4A Delivery 29 — migration sections compare directly
    // against their resolved cascade values. Dirty means the user has
    // diverged from what the renderer would otherwise have emitted.
    migrationMethodology:
      values.migrationMethodology !== initial.migrationMethodology,
    migrationPhases: values.migrationPhases !== initial.migrationPhases,
    migrationAssumptions:
      values.migrationAssumptions !== initial.migrationAssumptions,
    migrationRisks: values.migrationRisks !== initial.migrationRisks,
    migrationRollback:
      values.migrationRollback !== initial.migrationRollback,
    migrationOutOfScope:
      values.migrationOutOfScope !== initial.migrationOutOfScope,
  };

  // ── D34 — per-section Save / Cancel + close-with-save ──────────────
  // The handlers below back the new footer buttons inside each section.
  // They share the org-default payload builder with handleConfirm so
  // there's exactly one place that knows the column names — adding a
  // new save-as-default-capable section means updating that builder
  // and nothing else.

  /**
   * Build the org-default update payload for a single section, based
   * on the active mode and (for migration sections) the inferred
   * migration profile. Returns `null` when there's nothing to write —
   * either the section doesn't have a default column, or the migration
   * profile hasn't been inferred yet.
   */
  const buildProfileUpdateForSection = (
    id: SectionId,
  ): Record<string, string> | null => {
    const value = values[id];
    if (mode === "quick") {
      if (id === "terms") return { defaultTerms: value };
      if (id === "exclusions") return { defaultExclusions: value };
      return null;
    }
    // Branded mode.
    if (id === "terms") return { brandedTerms: value };
    if (id === "exclusions") return { brandedExclusions: value };
    if (id === "paymentTerms") return { brandedPaymentTerms: value };
    if (id === "signatoryName") return { brandedSignatoryName: value };
    if (id === "signatoryPosition") return { brandedSignatoryPosition: value };
    // Migration sections — resolved against the active profile. If
    // the profile is missing, skip silently rather than guess.
    const block: keyof MigrationProfileDefaults | null =
      id === "migrationMethodology"
        ? "methodology"
        : id === "migrationPhases"
          ? "phases"
          : id === "migrationAssumptions"
            ? "assumptions"
            : id === "migrationRisks"
              ? "risks"
              : id === "migrationRollback"
                ? "rollback"
                : id === "migrationOutOfScope"
                  ? "outOfScope"
                  : null;
    if (!block || !migrationProfile) return null;
    const key = profileDefaultsKey(migrationProfile, block);
    return { [key as string]: value };
  };

  /** Revert a single section's editor value to the modal-open snapshot. */
  const revertSectionValue = (id: SectionId) => {
    setValues((s) => {
      const next = { ...s };
      switch (id) {
        case "notes":
          next.notes = initial.notes;
          break;
        case "terms":
          next.terms = initial.terms;
          break;
        case "exclusions":
          next.exclusions =
            initial.exclusionsList || initial.exclusionsFallback;
          break;
        case "assumptions":
          next.assumptions = initial.assumptionsList;
          break;
        case "validUntil":
          next.validUntil = dateToInputValue(initial.validUntil);
          break;
        case "paymentTerms":
          next.paymentTerms = initial.paymentTerms;
          break;
        case "signatoryName":
          next.signatoryName = initial.signatoryName;
          break;
        case "signatoryPosition":
          next.signatoryPosition = initial.signatoryPosition;
          break;
        case "migrationMethodology":
          next.migrationMethodology = initial.migrationMethodology;
          break;
        case "migrationPhases":
          next.migrationPhases = initial.migrationPhases;
          break;
        case "migrationAssumptions":
          next.migrationAssumptions = initial.migrationAssumptions;
          break;
        case "migrationRisks":
          next.migrationRisks = initial.migrationRisks;
          break;
        case "migrationRollback":
          next.migrationRollback = initial.migrationRollback;
          break;
        case "migrationOutOfScope":
          next.migrationOutOfScope = initial.migrationOutOfScope;
          break;
      }
      return next;
    });
  };

  /**
   * Per-section Save — closes the editor and, if the tick is on,
   * eagerly persists this one section to org defaults via
   * auth.updateProfile. The per-quote write still happens at the
   * modal-level Generate / Close path. On failure the editor stays
   * open with an inline error so the user can retry.
   */
  const handleSectionSave = async (id: SectionId) => {
    const meta = SECTION_META[id];
    setInlineError(null);
    if (saveAsDefault[id] && meta.hasDefaultOption && dirty[id]) {
      const payload = buildProfileUpdateForSection(id);
      if (payload) {
        try {
          setIsSaving(true);
          await updateProfile.mutateAsync(payload as any);
          // Reset the tick so handleConfirm/handleClose don't write
          // it again on the way out.
          setSaveAsDefault((s) => ({ ...s, [id]: false }));
          invalidateAfterWrite();
          toast.success("Saved as your default");
        } catch (err) {
          const msg =
            err instanceof Error
              ? err.message
              : "Couldn't save default — try again.";
          setInlineError(msg);
          setIsSaving(false);
          return;
        } finally {
          setIsSaving(false);
        }
      }
    }
    setEditing((s) => ({ ...s, [id]: false }));
  };

  /** Per-section Cancel — revert to the initial value and close. */
  const handleSectionCancel = (id: SectionId) => {
    revertSectionValue(id);
    setSaveAsDefault((s) => ({ ...s, [id]: false }));
    setEditing((s) => ({ ...s, [id]: false }));
  };

  const handleConfirm = async (triggerOnConfirm = true) => {
    setInlineError(null);
    setIsSaving(true);
    try {
      const tasks: Promise<unknown>[] = [];

      // ── 1. Per-quote save (quotes.update) ──────────────────────
      const quoteUpdate: Record<string, unknown> = { id: quoteId };
      if (sectionIds.includes("terms") && dirty.terms) {
        quoteUpdate.terms = values.terms;
      }
      if (sectionIds.includes("validUntil") && dirty.validUntil) {
        const d = inputValueToDate(values.validUntil);
        if (d) quoteUpdate.validUntil = d;
      }
      if (sectionIds.includes("paymentTerms") && dirty.paymentTerms) {
        quoteUpdate.paymentTerms = values.paymentTerms || null;
      }
      if (sectionIds.includes("signatoryName") && dirty.signatoryName) {
        quoteUpdate.signatoryName = values.signatoryName || null;
      }
      if (
        sectionIds.includes("signatoryPosition")
        && dirty.signatoryPosition
      ) {
        quoteUpdate.signatoryPosition = values.signatoryPosition || null;
      }
      // Phase 4A Delivery 29 — per-quote migration overrides. Each
      // dirty section writes its full content (or null when blanked)
      // to the matching quote.migrationX column. The renderer then
      // reads tier 1 (per-quote) and falls through to tier 2 (org
      // default) → tier 3 (locked content) on subsequent generates of
      // OTHER quotes — these writes are scoped to this quote only.
      if (
        sectionIds.includes("migrationMethodology")
        && dirty.migrationMethodology
      ) {
        quoteUpdate.migrationMethodology =
          values.migrationMethodology || null;
      }
      if (sectionIds.includes("migrationPhases") && dirty.migrationPhases) {
        quoteUpdate.migrationPhases = values.migrationPhases || null;
      }
      if (
        sectionIds.includes("migrationAssumptions")
        && dirty.migrationAssumptions
      ) {
        quoteUpdate.migrationAssumptions =
          values.migrationAssumptions || null;
      }
      if (sectionIds.includes("migrationRisks") && dirty.migrationRisks) {
        quoteUpdate.migrationRisks = values.migrationRisks || null;
      }
      if (
        sectionIds.includes("migrationRollback")
        && dirty.migrationRollback
      ) {
        quoteUpdate.migrationRollback = values.migrationRollback || null;
      }
      if (
        sectionIds.includes("migrationOutOfScope")
        && dirty.migrationOutOfScope
      ) {
        quoteUpdate.migrationOutOfScope =
          values.migrationOutOfScope || null;
      }
      if (Object.keys(quoteUpdate).length > 1) {
        tasks.push(updateQuote.mutateAsync(quoteUpdate as any));
      }

      // ── 2. Tender-context save (tenderContext.upsert) ──────────
      const tcUpdate: {
        quoteId: number;
        notes?: string;
        assumptions?: AssumptionOrExclusion[];
        exclusions?: AssumptionOrExclusion[];
      } = { quoteId };
      if (sectionIds.includes("notes") && dirty.notes) {
        tcUpdate.notes = values.notes;
      }
      if (sectionIds.includes("assumptions") && dirty.assumptions) {
        tcUpdate.assumptions = textToList(values.assumptions);
      }
      if (sectionIds.includes("exclusions") && dirty.exclusions) {
        tcUpdate.exclusions = textToList(values.exclusions);
      }
      if (Object.keys(tcUpdate).length > 1) {
        tasks.push(upsertTenderContext.mutateAsync(tcUpdate));
      }

      // ── 3. Save-as-default (auth.updateProfile) ────────
      // Walk every section in the active mode and ask the shared
      // builder for its org-default payload. Only ticked + dirty
      // sections actually contribute. After per-section Save fires
      // the tick resets to false, so this loop is a catch-all for
      // sections the user ticked but never explicitly Saved before
      // reaching the modal exit (Generate or Close).
      const profileUpdate: Record<string, string> = {};
      for (const id of sectionIds) {
        if (!saveAsDefault[id] || !dirty[id]) continue;
        const payload = buildProfileUpdateForSection(id);
        if (payload) Object.assign(profileUpdate, payload);
      }
      if (Object.keys(profileUpdate).length > 0) {
        tasks.push(
          updateProfile.mutateAsync(profileUpdate as any),
        );
      }

      if (tasks.length > 0) {
        await Promise.all(tasks);
        invalidateAfterWrite();
        if (triggerOnConfirm) {
          toast.success("Review saved — generating…");
        } else {
          toast.success("Review saved");
        }
      }

      if (triggerOnConfirm) onConfirm();
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Couldn't save your review. Try again.";
      setInlineError(message);
      // Surface the error and let the user retry — do NOT close on
      // the close path either, since closing would lose unsaved work.
      throw err;
    } finally {
      setIsSaving(false);
    }
  };

  /**
   * D34 close path — runs the same writes as handleConfirm but does
   * not call onConfirm() (so no PDF generation), then dismisses the
   * modal. Called by the × icon, the bottom Close button, and the
   * Esc key. If the writes fail, the modal stays open with the inline
   * error showing so nothing is silently lost.
   */
  const handleClose = async () => {
    try {
      await handleConfirm(false);
      onOpenChange(false);
    } catch {
      // handleConfirm already surfaced the inline error.
    }
  };

  // ── Section renderer ─────────────────────────────────────────────
  const renderSection = (id: SectionId) => {
    const meta = SECTION_META[id];
    const value = values[id];
    const isEditing = editing[id];
    const sad = saveAsDefault[id];

    const onEdit = () => setEditing((s) => ({ ...s, [id]: true }));
    const onChange = (v: string) =>
      setValues((s) => ({ ...s, [id]: v }));
    const onToggleDefault = () =>
      setSaveAsDefault((s) => ({ ...s, [id]: !s[id] }));

    return (
      <div
        key={id}
        className="rounded-lg p-4 mb-3"
        style={{
          backgroundColor: brand.slate,
          border: `1px solid ${brand.border}`,
        }}
      >
        <div className="flex items-center justify-between mb-2">
          <div
            className="text-[11px] font-bold uppercase tracking-wide"
            style={{ color: brand.navyMuted }}
          >
            {meta.label}
          </div>
          {!isEditing && (
            <button
              type="button"
              onClick={onEdit}
              className="text-xs flex items-center gap-1 px-2 py-1 rounded border hover:bg-white"
              style={{ borderColor: brand.tealBorder, color: brand.teal }}
            >
              <Pencil className="w-3 h-3" />
              Edit
            </button>
          )}
        </div>

        {/* Body — read-only or editor */}
        {!isEditing ? (
          <ReadOnlyView
            value={value}
            meta={meta}
          />
        ) : meta.isDate ? (
          <Input
            type="date"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="text-sm"
          />
        ) : meta.multiline ? (
          <Textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="text-sm w-full"
            style={{ minHeight: meta.minHeight || "80px" }}
            autoFocus
          />
        ) : (
          <Input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="text-sm"
            autoFocus
          />
        )}

        {/* D34 — per-section editor footer. Cancel anchors the left,
            tick + Save anchor the right. The tick is visible the whole
            time the editor is open (not gated on dirty) so the
            affordance is discoverable before any typing happens. The
            Save button reuses the same teal CTA family the rest of the
            modal uses for primary actions. */}
        {isEditing && (
          <div className="flex items-center justify-between mt-3 gap-3 flex-wrap">
            <button
              type="button"
              onClick={() => handleSectionCancel(id)}
              disabled={isSaving}
              className="text-xs px-3 py-1.5 rounded border hover:bg-white"
              style={{ borderColor: brand.border, color: brand.navyMuted }}
            >
              Cancel
            </button>
            <div className="flex items-center gap-3">
              {meta.hasDefaultOption && (
                <label
                  className="flex items-center gap-1.5 text-xs cursor-pointer select-none"
                >
                  <input
                    type="checkbox"
                    checked={sad}
                    onChange={onToggleDefault}
                    className="rounded"
                    style={{ accentColor: brand.teal }}
                  />
                  <span style={{ color: brand.navyMuted }}>Save as default</span>
                </label>
              )}
              <button
                type="button"
                onClick={() => void handleSectionSave(id)}
                disabled={isSaving}
                className="text-xs flex items-center gap-1 px-3 py-1.5 rounded text-white"
                style={{ backgroundColor: brand.teal }}
              >
                <Check className="w-3 h-3" />
                Save
              </button>
            </div>
          </div>
        )}

        {/* Phase 4A Delivery 29 — hypercare-days hint, only on the
            rollback section. The locked rollback narrative contains a
            literal {hypercareDays} token which the renderer
            substitutes; surface that to the user so they don't think
            it's a typo. */}
        {id === "migrationRollback" && (
          <p
            className="text-[11px] mt-2 italic"
            style={{ color: brand.navyMuted }}
          >
            The {"{hypercareDays}"} placeholder is replaced on the PDF with your hypercare-days setting (
            {(initialHypercareDays && initialHypercareDays > 0)
              ? initialHypercareDays
              : (orgDefaults?.defaultHypercareDays && orgDefaults.defaultHypercareDays > 0)
                ? orgDefaults.defaultHypercareDays
                : DEFAULT_HYPERCARE_DAYS}{" "}
            days).
          </p>
        )}
      </div>
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        // D34 — any close attempt (× icon, Esc, programmatic) is
        // re-routed through handleClose so any pending edits are
        // committed before dismissal.
        if (!v) {
          void handleClose();
          return;
        }
        onOpenChange(v);
      }}
    >
      <DialogContent
        className="sm:max-w-[640px]"
        // D34 — outside-click is a no-op. The user can only dismiss
        // via × / Esc / Close / Generate, all of which save first.
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle style={{ color: brand.navy }}>
            Review before generating
          </DialogTitle>
          <DialogDescription>
            These sections go on the {mode === "branded" ? "proposal" : "PDF"}.
            Edit anything before it's generated.
          </DialogDescription>
        </DialogHeader>

        <div className="py-1 max-h-[60vh] overflow-y-auto pr-1">
          {sectionIds.map(renderSection)}

          {inlineError && (
            <div
              className="flex items-start gap-2 text-xs rounded-md px-3 py-2 mt-2"
              style={{
                backgroundColor: "#fef2f2",
                color: "#b91c1c",
                border: "1px solid #fecaca",
              }}
              role="alert"
            >
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{inlineError}</span>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => void handleClose()}
            disabled={isSaving}
          >
            Close
          </Button>
          <Button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={isSaving}
            className="text-white"
            style={{
              background: "linear-gradient(135deg, #0d9488 0%, #0f766e 100%)",
            }}
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving…
              </>
            ) : (
              <>
                <Download className="w-4 h-4 mr-2" />
                {mode === "branded" ? "Generate proposal" : "Generate PDF"}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Read-only view for a section's current value ─────────────────────

function ReadOnlyView({
  value,
  meta,
}: {
  value: string;
  meta: SectionMeta;
}) {
  if (!value || !value.trim()) {
    return (
      <p
        className="text-xs italic"
        style={{ color: brand.navyMuted }}
      >
        {meta.emptyPlaceholder}
      </p>
    );
  }

  if (meta.isDate) {
    // value is ISO yyyy-mm-dd from the input element. Render as a
    // friendly localised date.
    const dt = inputValueToDate(value);
    return (
      <p className="text-sm" style={{ color: brand.navy }}>
        {dt
          ? dt.toLocaleDateString(undefined, {
              year: "numeric",
              month: "long",
              day: "numeric",
            })
          : value}
      </p>
    );
  }

  if (meta.bulletRender) {
    const lines = value
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    return (
      <ul
        className="text-sm space-y-1 list-disc pl-5"
        style={{ color: brand.navy }}
      >
        {lines.map((line, idx) => (
          <li key={idx}>{line}</li>
        ))}
      </ul>
    );
  }

  return (
    <p
      className="text-sm whitespace-pre-wrap"
      style={{ color: brand.navy }}
    >
      {value}
    </p>
  );
}
