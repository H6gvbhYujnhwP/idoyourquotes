/**
 * SourceBadge.tsx
 *
 * Small visual chip rendered next to a line item to indicate where its
 * data came from (voice dictation, uploaded document) and the engine's
 * classification (catalog-match, client-specific, passthrough, estimated).
 *
 * Beta-1: this is the non-electrical simplified version extracted from
 * the retiring QuoteDraftSummary.tsx. Symbol-code rendering (used by the
 * electrical takeoff flow) is intentionally removed — the unified
 * workspace never runs for electrical quotes (QuoteRouter routes those
 * to ElectricalWorkspace). If electrical ever needs badges in a shared
 * component in future, we'd reintroduce a symbolCode prop.
 *
 * Rendering rules (precedence top-to-bottom):
 *   passthrough === true         → render nothing (engine couldn't match,
 *                                  echoing evidence verbatim)
 *   substitutable === false      → "Client-Specific" (blue)
 *   substitutable === true       → "Catalog" (green)
 *   catalogName or isSaved       → "Catalog" (green)
 *   estimated && !catalog        → "Estimated Price" (amber)
 *   source === "voice"           → "Voice" (teal)
 *   source === "document"        → "Document" (orange)
 */
export const sourceBadgeStyles: Record<string, { bg: string; color: string }> = {
  voice: { bg: "#f0fdfa", color: "#0d9488" },
  document: { bg: "#fff7ed", color: "#ea580c" },
  catalog: { bg: "#dcfce7", color: "#16a34a" },
  clientSpecific: { bg: "#eff6ff", color: "#3b82f6" },
  estimated: { bg: "#fef3c7", color: "#b45309" },
};

export interface SourceBadgeProps {
  source: string;
  catalogName?: string;
  estimated?: boolean;
  isSaved?: boolean;
  passthrough?: boolean;
  substitutable?: boolean | null;
}

const chipClass = "text-[9px] font-bold px-1.5 py-0.5 rounded";

export default function SourceBadge({
  source,
  catalogName,
  estimated,
  isSaved,
  passthrough,
  substitutable,
}: SourceBadgeProps) {
  // passthrough wins — no badge, no visual noise
  if (passthrough === true) {
    return <span className="inline-flex items-center gap-1 flex-wrap" />;
  }

  if (substitutable === false) {
    return (
      <span className="inline-flex items-center gap-1 flex-wrap">
        <span
          className={chipClass}
          style={{
            backgroundColor: sourceBadgeStyles.clientSpecific.bg,
            color: sourceBadgeStyles.clientSpecific.color,
          }}
        >
          Client-Specific
        </span>
      </span>
    );
  }

  if (substitutable === true) {
    return (
      <span className="inline-flex items-center gap-1 flex-wrap">
        <span
          className={chipClass}
          style={{
            backgroundColor: sourceBadgeStyles.catalog.bg,
            color: sourceBadgeStyles.catalog.color,
          }}
        >
          Catalog
        </span>
      </span>
    );
  }

  // Fall-through: all three engine-metadata fields undefined
  return (
    <span className="inline-flex items-center gap-1 flex-wrap">
      {(catalogName || isSaved) && (
        <span
          className={chipClass}
          style={{
            backgroundColor: sourceBadgeStyles.catalog.bg,
            color: sourceBadgeStyles.catalog.color,
          }}
        >
          Catalog
        </span>
      )}
      {estimated && !catalogName && !isSaved && (
        <span
          className={chipClass}
          style={{
            backgroundColor: sourceBadgeStyles.estimated.bg,
            color: sourceBadgeStyles.estimated.color,
          }}
        >
          Estimated Price
        </span>
      )}
      {source === "voice" && !catalogName && !estimated && (
        <span
          className={chipClass}
          style={{
            backgroundColor: sourceBadgeStyles.voice.bg,
            color: sourceBadgeStyles.voice.color,
          }}
        >
          Voice
        </span>
      )}
      {source === "document" && !catalogName && !estimated && (
        <span
          className={chipClass}
          style={{
            backgroundColor: sourceBadgeStyles.document.bg,
            color: sourceBadgeStyles.document.color,
          }}
        >
          Document
        </span>
      )}
    </span>
  );
}
