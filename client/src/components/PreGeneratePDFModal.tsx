/**
 * PreGeneratePDFModal.tsx
 *
 * Chunk 3 Delivery H — review-before-PDF modal.
 *
 * Gates the "Generate PDF" button on the quote workspace. When the user
 * clicks Generate PDF, this modal opens first and shows the three blocks
 * that will appear on the PDF — Terms, Exclusions, Assumptions — each
 * read-only by default with an inline Edit link. The AI has already
 * populated these during the draft; this is the user's last chance to
 * eyeball them before the PDF goes out to a customer.
 *
 * Data model note:
 *   - "terms" is a single string stored on quotes.terms (updated via
 *     quotes.update).
 *   - "assumptions" and "exclusions" are arrays of { text, confirmed }
 *     stored in tender_contexts (updated via tenderContext.upsert). This
 *     modal treats them as lists of plain strings in the UI and packs
 *     them back into the { text, confirmed } shape on save.
 *
 * Editing flow:
 *   - Each section has its own Edit link. Clicking swaps the read-only
 *     paragraph for a textarea pre-filled with the current value.
 *   - Edits are held locally until the user clicks Generate PDF. Cancel
 *     discards everything typed and closes without saving.
 *   - On Generate PDF: save any edited sections first (parallel), then
 *     call the parent's onConfirm which triggers the actual PDF gen.
 *     If any save fails, we surface the error inline and keep the modal
 *     open — the user hasn't lost their edits.
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
import { Textarea } from "@/components/ui/textarea";
import { AlertCircle, Download, Loader2, Pencil } from "lucide-react";
import { brand } from "@/lib/brandTheme";

// ─── Types ────────────────────────────────────────────────────────────────

type AssumptionOrExclusion = { text: string; confirmed: boolean };

interface PreGeneratePDFModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quoteId: number;
  // Initial values pulled from fullQuote on the workspace. All optional
  // because a freshly-generated quote may have any of these blank.
  initialTerms: string | null | undefined;
  initialAssumptions: AssumptionOrExclusion[] | null | undefined;
  initialExclusions: AssumptionOrExclusion[] | null | undefined;
  // Fired AFTER any edited sections have been saved successfully.
  // The parent triggers the PDF generation from this callback.
  onConfirm: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

/**
 * Convert a list of { text, confirmed } objects into a multi-line string
 * for display/editing. Empty / nullish input becomes an empty string so
 * the textarea doesn't render "null" or "[object Object]".
 */
function listToText(
  items: AssumptionOrExclusion[] | null | undefined,
): string {
  if (!items || items.length === 0) return "";
  return items.map((i) => i.text).join("\n");
}

/**
 * Parse a user-edited multi-line string back into the { text, confirmed }
 * shape the tender_contexts table stores. Blank lines are dropped so
 * the user can separate with whitespace without creating ghost rows.
 * The confirmed flag defaults to true — the user has just eyeballed
 * this content; it counts as confirmed.
 */
function textToList(text: string): AssumptionOrExclusion[] {
  return text
    .split("\n")
    .map((l) => l.replace(/^\s*[•\-*]\s*/, "").trim())
    .filter((l) => l.length > 0)
    .map((l) => ({ text: l, confirmed: true }));
}

// ─── Component ────────────────────────────────────────────────────────────

export default function PreGeneratePDFModal({
  open,
  onOpenChange,
  quoteId,
  initialTerms,
  initialAssumptions,
  initialExclusions,
  onConfirm,
}: PreGeneratePDFModalProps) {
  // One Edit toggle per section — separate state so a user can edit one
  // without the other two flipping to edit mode.
  const [editTerms, setEditTerms] = useState(false);
  const [editAssumptions, setEditAssumptions] = useState(false);
  const [editExclusions, setEditExclusions] = useState(false);

  // Local draft values — always populated, even when the section isn't
  // in edit mode, so Cancel / reopen shows the right content.
  const [termsText, setTermsText] = useState("");
  const [assumptionsText, setAssumptionsText] = useState("");
  const [exclusionsText, setExclusionsText] = useState("");

  // Inline error banner inside the modal — used when saving a section
  // fails. Does NOT clear on re-edit; only clears on a new save attempt
  // or dialog close.
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Memoise the "as entered" versions of assumptions/exclusions so we
  // only pay the map/join cost when the input actually changes.
  const initialAssumptionsText = useMemo(
    () => listToText(initialAssumptions),
    [initialAssumptions],
  );
  const initialExclusionsText = useMemo(
    () => listToText(initialExclusions),
    [initialExclusions],
  );

  // Reset local state whenever the dialog opens afresh. Intentionally
  // NOT resetting on every prop change — that would wipe an in-progress
  // edit if the parent's fullQuote refetched mid-review.
  useEffect(() => {
    if (!open) return;
    setTermsText(initialTerms || "");
    setAssumptionsText(initialAssumptionsText);
    setExclusionsText(initialExclusionsText);
    setEditTerms(false);
    setEditAssumptions(false);
    setEditExclusions(false);
    setInlineError(null);
    setIsSaving(false);
    // Only re-run when the dialog transitions to open — we snapshot
    // the initial values at that moment and hold them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const updateQuote = trpc.quotes.update.useMutation();
  const upsertTenderContext = trpc.tenderContext.upsert.useMutation();

  // Detect whether each section has actually been edited vs. the original.
  // Only dirty sections get saved — keeps the network chatter minimal
  // and avoids spurious updatedAt bumps.
  const termsDirty = termsText !== (initialTerms || "");
  const assumptionsDirty = assumptionsText !== initialAssumptionsText;
  const exclusionsDirty = exclusionsText !== initialExclusionsText;

  const handleConfirm = async () => {
    setInlineError(null);
    setIsSaving(true);
    try {
      // Fire all needed saves in parallel. Terms goes to the quote row;
      // assumptions/exclusions go to tender_contexts (one upsert covers
      // both if they're both dirty).
      const tasks: Promise<unknown>[] = [];

      if (termsDirty) {
        tasks.push(
          updateQuote.mutateAsync({
            id: quoteId,
            terms: termsText,
          }),
        );
      }

      if (assumptionsDirty || exclusionsDirty) {
        const payload: {
          quoteId: number;
          assumptions?: AssumptionOrExclusion[];
          exclusions?: AssumptionOrExclusion[];
        } = { quoteId };
        if (assumptionsDirty) {
          payload.assumptions = textToList(assumptionsText);
        }
        if (exclusionsDirty) {
          payload.exclusions = textToList(exclusionsText);
        }
        tasks.push(upsertTenderContext.mutateAsync(payload));
      }

      if (tasks.length > 0) {
        await Promise.all(tasks);
        toast.success("Review saved — generating PDF…");
      }

      // Hand control back to the parent. The parent closes the modal and
      // triggers doGeneratePDF. We intentionally don't close the modal
      // ourselves here so any parent-side pre-PDF logic (missing costs
      // guard, etc.) stays in charge.
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle style={{ color: brand.navy }}>
            Review before generating PDF
          </DialogTitle>
          <DialogDescription>
            These sections go on the PDF. Edit anything before it's
            generated.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 py-1 max-h-[60vh] overflow-y-auto">
          <ReviewSection
            label="Terms & conditions"
            value={termsText}
            editing={editTerms}
            onEdit={() => setEditTerms(true)}
            onChange={setTermsText}
            minHeight="120px"
            emptyPlaceholder="No terms set. Click Edit to add."
          />

          <ReviewSection
            label="Exclusions"
            value={exclusionsText}
            editing={editExclusions}
            onEdit={() => setEditExclusions(true)}
            onChange={setExclusionsText}
            minHeight="100px"
            emptyPlaceholder="No exclusions set. Click Edit to add — one per line."
            bulletRender
          />

          <ReviewSection
            label="Assumptions"
            value={assumptionsText}
            editing={editAssumptions}
            onEdit={() => setEditAssumptions(true)}
            onChange={setAssumptionsText}
            minHeight="100px"
            emptyPlaceholder="No assumptions set. Click Edit to add — one per line."
            bulletRender
          />

          {inlineError && (
            <div
              className="flex items-start gap-2 text-xs rounded-md px-3 py-2"
              style={{
                backgroundColor: "#fef2f2",
                color: "#b91c1c",
                border: "1px solid #fecaca",
              }}
              role="alert"
            >
              <AlertCircle className="w-3.5 h-3.5 mt-[1px] flex-shrink-0" />
              <span>{inlineError}</span>
            </div>
          )}
        </div>

        <DialogFooter>
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
            onClick={handleConfirm}
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
                Generate PDF
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── ReviewSection ────────────────────────────────────────────────────────

interface ReviewSectionProps {
  label: string;
  value: string;
  editing: boolean;
  onEdit: () => void;
  onChange: (v: string) => void;
  minHeight: string;
  emptyPlaceholder: string;
  // When true, the read-only view renders each non-empty line with a
  // bullet glyph — used for exclusions and assumptions, which are
  // conceptually lists even though we store them as joined text while
  // editing. Terms stays prose.
  bulletRender?: boolean;
}

function ReviewSection({
  label,
  value,
  editing,
  onEdit,
  onChange,
  minHeight,
  emptyPlaceholder,
  bulletRender,
}: ReviewSectionProps) {
  const isEmpty = value.trim().length === 0;

  return (
    <div
      className="rounded-md px-3.5 py-2.5"
      style={{ backgroundColor: "#f8fafc" }}
    >
      <div className="flex items-center justify-between mb-1.5">
        <span
          className="text-[11px] font-semibold uppercase tracking-wider"
          style={{ color: brand.navyMuted }}
        >
          {label}
        </span>
        {!editing && (
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex items-center gap-1 text-[11px] font-medium transition-colors hover:underline"
            style={{ color: brand.teal }}
          >
            <Pencil className="w-3 h-3" />
            Edit
          </button>
        )}
      </div>

      {editing ? (
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoFocus
          className="text-xs bg-white"
          style={{ minHeight, borderColor: brand.border }}
        />
      ) : isEmpty ? (
        <p
          className="text-xs italic"
          style={{ color: brand.navyMuted }}
        >
          {emptyPlaceholder}
        </p>
      ) : bulletRender ? (
        <ul
          className="text-xs leading-relaxed space-y-0.5"
          style={{ color: brand.navy }}
        >
          {value
            .split("\n")
            .map((l) => l.trim())
            .filter((l) => l.length > 0)
            .map((line, i) => (
              <li key={i} className="flex gap-1.5">
                <span
                  className="flex-shrink-0"
                  style={{ color: brand.navyMuted }}
                >
                  •
                </span>
                <span>{line.replace(/^[•\-*]\s*/, "")}</span>
              </li>
            ))}
        </ul>
      ) : (
        <p
          className="text-xs leading-relaxed whitespace-pre-wrap"
          style={{ color: brand.navy }}
        >
          {value}
        </p>
      )}
    </div>
  );
}
