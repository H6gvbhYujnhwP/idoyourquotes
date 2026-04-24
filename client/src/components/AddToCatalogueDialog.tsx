/**
 * AddToCatalogueDialog.tsx
 *
 * Chunk 3 Delivery B — opened from the "Add to catalogue" button that
 * sits on every AI-estimated line item in the quote workspace. Pre-fills
 * from the row the user clicked (name, description, unit, rate, cost,
 * pricing type) and saves via catalog.createFromLineItem.
 *
 * Error surface is inline inside this dialog — the user's typed values
 * are NEVER cleared on a failed save. This is important for the two
 * errors the server can throw:
 *
 *   • Plan cap reached — user may want to change their mind or upgrade;
 *     retaining input lets them close without re-typing.
 *   • Duplicate name — user may just need to tweak the name and retry.
 *
 * On success: closes the dialog, toasts, and relies on the parent to
 * invalidate catalog.list so the CatalogPicker elsewhere in the row
 * stack sees the new item immediately.
 */
import { useState, useEffect } from "react";
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertCircle, Loader2 } from "lucide-react";
import { brand } from "@/lib/brandTheme";

// ─── Helpers ──────────────────────────────────────────────────────────────

type PricingType = "standard" | "monthly" | "annual" | "optional";

// Accepted on the server; narrowed from the wider set of legacy strings
// the line item table can hold. Anything the server can't store falls
// back to "standard" so saves never bounce on an enum check.
function normalisePricingType(pt: string | null | undefined): PricingType {
  if (pt === "monthly") return "monthly";
  if (pt === "annual") return "annual";
  if (pt === "optional") return "optional";
  return "standard";
}

function pricingTypeLabel(pt: PricingType): string {
  if (pt === "monthly") return "Monthly cost";
  if (pt === "annual") return "Annual cost";
  if (pt === "optional") return "Optional";
  return "One-off cost";
}

// ─── Props ────────────────────────────────────────────────────────────────

export interface AddToCatalogueSeed {
  name: string;
  description: string | null;
  unit: string | null;
  rate: string | null;
  costPrice: string | null;
  pricingType: string | null;
}

interface AddToCatalogueDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  seed: AddToCatalogueSeed | null;
  onSaved: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────

export default function AddToCatalogueDialog({
  open,
  onOpenChange,
  seed,
  onSaved,
}: AddToCatalogueDialogProps) {
  // Local form state — deliberately kept inside the dialog so a failed
  // save preserves every character the user typed. We only pull from seed
  // when the dialog opens or when the seed reference changes while open.
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [unit, setUnit] = useState("");
  const [rate, setRate] = useState("");
  const [costPrice, setCostPrice] = useState("");
  const [pricingType, setPricingType] = useState<PricingType>("standard");
  const [inlineError, setInlineError] = useState<string | null>(null);

  // Reset the form whenever a fresh seed arrives (new row clicked) OR
  // the dialog transitions from closed → open. Intentionally NOT reset
  // on close so if the user cancels mid-type and re-opens for the same
  // row, nothing flickers — they'll get a fresh pre-fill from the row.
  useEffect(() => {
    if (!open || !seed) return;
    setName(seed.name || "");
    setDescription(seed.description || "");
    setUnit(seed.unit || "");
    setRate(seed.rate || "");
    setCostPrice(seed.costPrice || "");
    setPricingType(normalisePricingType(seed.pricingType));
    setInlineError(null);
  }, [open, seed]);

  const createFromLineItem = trpc.catalog.createFromLineItem.useMutation();

  const isSaving = createFromLineItem.isPending;
  const trimmedName = name.trim();
  const canSave = trimmedName.length > 0 && !isSaving;

  const handleSave = async () => {
    if (!canSave) return;
    setInlineError(null);
    try {
      await createFromLineItem.mutateAsync({
        name: trimmedName,
        description: description.trim() || undefined,
        unit: unit.trim() || undefined,
        defaultRate: rate.trim() || undefined,
        costPrice: costPrice.trim() || undefined,
        pricingType,
      });
      toast.success("Added to catalogue.");
      onSaved();
      onOpenChange(false);
    } catch (err) {
      // Surface the server message verbatim — stripe.ts / the router
      // already word these for end-users (plan cap, duplicate name).
      const message =
        err instanceof Error
          ? err.message
          : "Couldn't save to catalogue. Try again.";
      setInlineError(message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[540px]">
        <DialogHeader>
          <DialogTitle style={{ color: brand.navy }}>
            Add to catalogue
          </DialogTitle>
          <DialogDescription>
            Review the details and save this as a reusable catalogue item.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="catalogue-name" className="text-xs font-semibold">
              Name
            </Label>
            <Input
              id="catalogue-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={255}
              placeholder="e.g. Monthly IT support"
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label
              htmlFor="catalogue-description"
              className="text-xs font-semibold"
            >
              Description
            </Label>
            <Textarea
              id="catalogue-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Optional — a short note shown on future quotes."
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="catalogue-unit" className="text-xs font-semibold">
                Unit
              </Label>
              <Input
                id="catalogue-unit"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="each"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="catalogue-rate" className="text-xs font-semibold">
                Rate (£)
              </Label>
              <Input
                id="catalogue-rate"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                inputMode="decimal"
                placeholder="0.00"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="catalogue-cost" className="text-xs font-semibold">
                Cost (£)
              </Label>
              <Input
                id="catalogue-cost"
                value={costPrice}
                onChange={(e) => setCostPrice(e.target.value)}
                inputMode="decimal"
                placeholder="0.00"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Pricing type</Label>
            <Select
              value={pricingType}
              onValueChange={(v) => setPricingType(v as PricingType)}
            >
              <SelectTrigger>
                <SelectValue>{pricingTypeLabel(pricingType)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="standard">One-off cost</SelectItem>
                <SelectItem value="monthly">Monthly cost</SelectItem>
                <SelectItem value="annual">Annual cost</SelectItem>
                <SelectItem value="optional">Optional</SelectItem>
              </SelectContent>
            </Select>
          </div>

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
            onClick={handleSave}
            disabled={!canSave}
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
              "Save to catalogue"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
