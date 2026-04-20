/**
 * StatusPill — brand-aligned status pill for quotes.
 *
 * Maps DB enum values → user-facing labels with the v2 terminology:
 *   accepted      → Won
 *   declined      → Lost
 *   pdf_generated → PDF Generated
 *
 * Renders the `brand-status-pill` + a status-specific modifier class
 * (both defined in index.css under the v2 brand-aligned status pill
 * block). Unknown status values fall back to Draft styling so the
 * dashboard can't crash if the DB returns an unexpected value.
 */

type QuoteStatus = "draft" | "sent" | "accepted" | "declined" | "pdf_generated";

const STATUS_LABELS: Record<QuoteStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  pdf_generated: "PDF Generated",
  accepted: "Won",
  declined: "Lost",
};

const STATUS_CLASSES: Record<QuoteStatus, string> = {
  draft: "brand-status-draft",
  sent: "brand-status-sent",
  pdf_generated: "brand-status-pdf-generated",
  accepted: "brand-status-won",
  declined: "brand-status-lost",
};

function isKnownStatus(value: string): value is QuoteStatus {
  return value in STATUS_LABELS;
}

export function StatusPill({ status }: { status: string }) {
  const key: QuoteStatus = isKnownStatus(status) ? status : "draft";
  return (
    <span className={`brand-status-pill ${STATUS_CLASSES[key]}`}>
      {STATUS_LABELS[key]}
    </span>
  );
}

/** Human-readable label for a given status value — useful for the
 *  filter pills so labels and pill colours stay in sync. */
export function statusLabel(status: string): string {
  return isKnownStatus(status) ? STATUS_LABELS[status] : "Draft";
}
