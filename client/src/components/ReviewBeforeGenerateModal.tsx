/**
 * ReviewBeforeGenerateModal.tsx
 *
 * Phase 4A — Delivery 24. Replaces PreGeneratePDFModal (Chunk 3
 * Delivery H), broadening it from Quick-Quote-only to a mode-aware
 * gate that also serves the Contract/Tender (branded) flow. A future
 * Project/Migration mode will plug in by extending the section
 * registry — no rewrite required.
 *
 * What this modal does
 * --------------------
 *   1. Shows the user every field that ends up on the PDF for the
 *      mode they're generating, with inline read-only paragraphs.
 *   2. Lets them toggle Edit on any section to tweak per-quote.
 *   3. Surfaces a "save as my default" checkbox on sections that
 *      have a per-mode default column. Ticking it ALSO writes the
 *      edited value to organizations.{branded,default}X so it pre-
 *      populates the next quote of the same mode. Save-as-default
 *      in Quick mode does NOT bleed into Branded mode and vice
 *      versa — the columns are physically separate.
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
 *
 * Mutation order on confirm
 * -------------------------
 *   1. quotes.update           — if any per-quote field is dirty
 *   2. tenderContext.upsert    — if notes/assumptions/exclusions dirty
 *   3. auth.updateProfile — if any save-as-default is ticked
 *   All three fire in parallel; if any fails, the modal stays open and
 *   surfaces the error inline so edits aren't lost.
 *
 *   onConfirm() is called only after all dirty saves resolve. The
 *   parent triggers the actual PDF / branded-proposal generation from
 *   that callback.
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
import { AlertCircle, Download, Loader2, Pencil } from "lucide-react";
import { brand } from "@/lib/brandTheme";

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
  | "signatoryPosition";

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
};

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
  orgDefaults,
  onConfirm,
}: ReviewBeforeGenerateModalProps) {
  const sectionIds = mode === "branded" ? BRANDED_SECTIONS : QUICK_SECTIONS;

  // Compute initial display values via cascade for each section. This
  // is what the renderer would emit today; the modal shows it as the
  // status quo and the user edits diff against it.
  const initial = useMemo(() => {
    const od = orgDefaults || {};
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
  });

  const [inlineError, setInlineError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Reset on open. Snapshot of initial values is held for the duration
  // of the open session so the parent's fullQuote refetching mid-review
  // doesn't wipe in-progress edits.
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
    });
    setInlineError(null);
    setIsSaving(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial]);

  const updateQuote = trpc.quotes.update.useMutation();
  const upsertTenderContext = trpc.tenderContext.upsert.useMutation();
  const updateProfile = trpc.auth.updateProfile.useMutation();

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
  };

  const handleConfirm = async () => {
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
      // Only ticked sections that are also dirty actually write — no
      // point persisting a default that's identical to what was
      // already loaded.
      const profileUpdate: Record<string, string> = {};
      if (mode === "quick") {
        // Quick mode writes to the legacy default* family.
        if (saveAsDefault.terms && dirty.terms) {
          profileUpdate.defaultTerms = values.terms;
        }
        if (saveAsDefault.exclusions && dirty.exclusions) {
          profileUpdate.defaultExclusions = values.exclusions;
        }
      } else {
        // Branded mode writes to the branded* family.
        if (saveAsDefault.terms && dirty.terms) {
          profileUpdate.brandedTerms = values.terms;
        }
        if (saveAsDefault.exclusions && dirty.exclusions) {
          profileUpdate.brandedExclusions = values.exclusions;
        }
        if (saveAsDefault.paymentTerms && dirty.paymentTerms) {
          profileUpdate.brandedPaymentTerms = values.paymentTerms;
        }
        if (saveAsDefault.signatoryName && dirty.signatoryName) {
          profileUpdate.brandedSignatoryName = values.signatoryName;
        }
        if (saveAsDefault.signatoryPosition && dirty.signatoryPosition) {
          profileUpdate.brandedSignatoryPosition = values.signatoryPosition;
        }
      }
      if (Object.keys(profileUpdate).length > 0) {
        tasks.push(
          updateProfile.mutateAsync(profileUpdate as any),
        );
      }

      if (tasks.length > 0) {
        await Promise.all(tasks);
        toast.success("Review saved — generating…");
      }

      onConfirm();
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Couldn't save your review. Try again.";
      setInlineError(message);
    } finally {
      setIsSaving(false);
    }
  };

  // ── Section renderer ─────────────────────────────────────────────
  const renderSection = (id: SectionId) => {
    const meta = SECTION_META[id];
    const value = values[id];
    const isEditing = editing[id];
    const sad = saveAsDefault[id];
    const sectionDirty = dirty[id];

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

        {/* Save-as-default checkbox — shown only when the section
            supports it AND the user has actually edited (otherwise
            the affordance has nothing to persist). */}
        {meta.hasDefaultOption && sectionDirty && (
          <label className="flex items-center gap-2 mt-3 text-xs cursor-pointer select-none">
            <input
              type="checkbox"
              checked={sad}
              onChange={onToggleDefault}
              className="rounded"
              style={{ accentColor: brand.teal }}
            />
            <span style={{ color: brand.navyMuted }}>
              Save as my default for future {mode === "branded" ? "Contract / Tender" : "Quick Quote"} proposals
            </span>
          </label>
        )}
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[640px]">
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
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
          >
            Cancel
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
