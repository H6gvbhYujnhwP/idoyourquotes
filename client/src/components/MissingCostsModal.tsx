/**
 * MissingCostsModal.tsx
 *
 * Shown when the user clicks "Generate PDF" and one or more line items
 * have no unit price (unitPrice == null or === 0). Gives the user a
 * chance to cancel and go back to fill in the prices, or proceed anyway
 * and generate a PDF with "£0.00" rows.
 *
 * Client-side only — the actual PDF generation is gated behind the
 * "Continue anyway" action in the parent workspace.
 */
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { brand } from "@/lib/brandTheme";

interface MissingCostsModalProps {
  open: boolean;
  missingCount: number;
  onCancel: () => void;
  onContinue: () => void;
}

export default function MissingCostsModal({
  open,
  missingCount,
  onCancel,
  onContinue,
}: MissingCostsModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: "rgba(15, 23, 42, 0.45)" }}
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-labelledby="missing-costs-title"
    >
      <div
        className="bg-white rounded-xl shadow-2xl p-6 w-[440px] max-w-[92vw]"
        style={{ border: `1px solid ${brand.border}` }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <div
            className="flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: "#fef3c7" }}
          >
            <AlertTriangle className="w-5 h-5" style={{ color: "#b45309" }} />
          </div>
          <div className="flex-1">
            <h3
              id="missing-costs-title"
              className="text-base font-bold"
              style={{ color: brand.navy }}
            >
              {missingCount === 1
                ? "1 row has no price set"
                : `${missingCount} rows have no price set`}
            </h3>
            <p
              className="text-sm mt-1.5 leading-relaxed"
              style={{ color: brand.navyMuted }}
            >
              You can cancel, fill those rates in, and come back. Or continue
              and the PDF will list those rows at £0.00.
            </p>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <Button
            variant="outline"
            onClick={onCancel}
            className="text-sm"
          >
            Cancel
          </Button>
          <Button
            onClick={onContinue}
            className="text-sm text-white"
            style={{
              background: "linear-gradient(135deg, #0d9488 0%, #0f766e 100%)",
            }}
          >
            Continue anyway
          </Button>
        </div>
      </div>
    </div>
  );
}
