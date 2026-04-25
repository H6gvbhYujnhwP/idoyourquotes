/**
 * BrandChoiceModal.tsx
 *
 * Phase 4A — Delivery 7. Brochure-upload UI removed in Delivery 13.
 *
 * Opens after the user picks the Contract/Tender card in the export-format
 * picker. Lets them choose how the branded proposal is styled:
 *
 *   Card A — "Use your branding"
 *     Shows a logo preview + two colour swatches + a Generate button
 *     when the org has brand tokens ready (logo set, colours extracted
 *     or logo-pixel-derived). If the org has nothing yet (or extraction
 *     is still running), the card swaps to an INLINE SETUP form:
 *       - logo drag-drop (or click-to-browse)
 *       - website URL input
 *       - Save & Generate button that fires pending uploads, saves the
 *         website, then runs the branded proposal mutation
 *
 *   Card B — "Use template defaults"
 *     Always available. One click. Generates with the template's
 *     built-in navy/violet palette. Good escape hatch for users who
 *     don't want to faff with branding for a one-off quote.
 *
 * A "← Back" link in the header returns to the picker (onBack callback).
 *
 * Both generate paths resolve to the parent via `onGenerate(brandMode)`.
 * The parent (QuoteWorkspace) owns the actual mutation + print window —
 * this modal is a pure chooser / setup form.
 */

import { useEffect, useMemo, useState, useRef } from "react";
import {
  X,
  ArrowLeft,
  ArrowRight,
  Upload,
  Globe,
  Loader2,
  Sparkles,
  Palette,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { brand } from "@/lib/brandTheme";
import { trpc } from "@/lib/trpc";

export type BrandMode = "branded" | "template";

interface BrandChoiceModalProps {
  open: boolean;
  /** Close without action (overlay click, Esc, [×]). */
  onDismiss: () => void;
  /** Return to the format picker (← Back). */
  onBack: () => void;
  /**
   * Fired once the user has committed to a brand mode and any inline
   * setup has been saved. The parent runs the generation mutation.
   */
  onGenerate: (mode: BrandMode) => void;
  /** True while the parent mutation is in flight. Disables both buttons. */
  isGenerating?: boolean;
}

// ── Hex helpers — only used for the swatch preview. ────────────────

function isValidHex(v: unknown): boolean {
  return typeof v === "string" && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v);
}

// ── Derived brand-ready state ──────────────────────────────────────

interface BrandTokensSnapshot {
  logoUrl: string | null;
  primary: string | null;
  secondary: string | null;
  extractionStatus: string;
  /** True when we have enough to render a credible "branded" output. */
  ready: boolean;
  /** True when extraction is still running — UI stays silent but flags it. */
  extracting: boolean;
}

function readBrandTokens(org: any): BrandTokensSnapshot {
  const logoUrl = (org?.companyLogo as string | null) || null;
  const extractedP = isValidHex(org?.brandExtractedPrimaryColor)
    ? org.brandExtractedPrimaryColor
    : null;
  const extractedS = isValidHex(org?.brandExtractedSecondaryColor)
    ? org.brandExtractedSecondaryColor
    : null;
  const logoP = isValidHex(org?.brandPrimaryColor) ? org.brandPrimaryColor : null;
  const logoS = isValidHex(org?.brandSecondaryColor) ? org.brandSecondaryColor : null;
  const primary = extractedP || logoP;
  const secondary = extractedS || logoS;
  const extractionStatus = (org?.brandExtractionStatus as string) || "idle";
  // "Ready" means: has a logo AND at least a primary colour. Secondary is
  // a nice-to-have — the renderer tolerates it missing.
  const ready = !!(logoUrl && primary);
  const extracting = extractionStatus === "pending";
  return { logoUrl, primary, secondary, extractionStatus, ready, extracting };
}

// ── Modal ──────────────────────────────────────────────────────────

export default function BrandChoiceModal({
  open,
  onDismiss,
  onBack,
  onGenerate,
  isGenerating = false,
}: BrandChoiceModalProps) {
  // Read current org state — used to decide which face of Card A to show.
  const { data: orgProfile } = trpc.auth.orgProfile.useQuery(undefined, {
    enabled: open,
  });
  const utils = trpc.useUtils();

  const tokens = useMemo(() => readBrandTokens(orgProfile), [orgProfile]);

  // ── Inline setup state ─────────────────────────────────────────

  const [websiteUrl, setWebsiteUrl] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Seed the website field from the org whenever it loads / refreshes —
  // but don't clobber user edits in flight.
  const [websiteSeeded, setWebsiteSeeded] = useState(false);
  useEffect(() => {
    if (!websiteSeeded && orgProfile) {
      setWebsiteUrl(((orgProfile as any).companyWebsite as string) || "");
      setWebsiteSeeded(true);
    }
  }, [orgProfile, websiteSeeded]);

  // Reset per-open transient state.
  useEffect(() => {
    if (!open) {
      setWebsiteSeeded(false);
      setIsDragging(false);
    }
  }, [open]);

  // ── Mutations ──────────────────────────────────────────────────

  const uploadLogo = trpc.auth.uploadLogo.useMutation({
    onSuccess: () => {
      utils.auth.orgProfile.invalidate();
      toast.success("Logo uploaded");
    },
    onError: (err) => {
      toast.error(err.message || "Failed to upload logo");
    },
  });

  const updateBrandSettings = trpc.auth.updateBrandSettings.useMutation({
    onSuccess: () => {
      utils.auth.orgProfile.invalidate();
    },
    onError: (err) => {
      toast.error(err.message || "Failed to save brand settings");
    },
  });

  // Esc closes.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isGenerating) onDismiss();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onDismiss, isGenerating]);

  if (!open) return null;

  // ── Handlers ───────────────────────────────────────────────────

  const handleLogoFile = (file: File) => {
    const allowed = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    if (!allowed.includes(file.type)) {
      toast.error("Logo must be a JPG, PNG, GIF, or WebP");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Logo must be less than 2MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(",")[1];
      uploadLogo.mutate({
        filename: file.name,
        contentType: file.type,
        base64Data: base64,
      });
    };
    reader.readAsDataURL(file);
  };

  const handleLogoPicker = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (e.target) e.target.value = "";
    if (!file) return;
    handleLogoFile(file);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleLogoFile(file);
  };

  const handleSaveAndGenerate = async () => {
    // Save the website URL first (if the user typed one) so it feeds the
    // next extraction run. Fire-and-forget for the save — the renderer
    // doesn't need it for THIS render, but subsequent renders benefit.
    const currentWebsite = ((orgProfile as any)?.companyWebsite as string) || "";
    if (websiteUrl && websiteUrl !== currentWebsite) {
      try {
        await updateBrandSettings.mutateAsync({ companyWebsite: websiteUrl });
      } catch {
        // Error toast already fired in onError — but we continue to
        // generation anyway. The website is supplementary evidence; a
        // failed save shouldn't block the user from getting their doc.
      }
    }
    onGenerate("branded");
  };

  // ── Card A body variants ───────────────────────────────────────

  const busy =
    uploadLogo.isPending
    || updateBrandSettings.isPending;

  const cardBranded = tokens.ready ? (
    // Tokens ready — compact preview + Generate button.
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 mb-2">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: brand.tealBg }}
        >
          <Sparkles className="w-4 h-4" style={{ color: brand.teal }} />
        </div>
        <div className="text-sm font-bold" style={{ color: brand.navy }}>
          Use your branding
        </div>
      </div>
      <p
        className="text-xs leading-relaxed mb-3"
        style={{ color: brand.navyMuted }}
      >
        Your logo and brand colours will be applied to the proposal
        automatically.
      </p>

      <div
        className="rounded-lg p-4 flex items-center gap-4 mb-3"
        style={{
          backgroundColor: brand.slate,
          border: `1px solid ${brand.border}`,
        }}
      >
        <div
          className="w-16 h-16 rounded bg-white flex items-center justify-center overflow-hidden flex-shrink-0"
          style={{ border: `1px solid ${brand.border}` }}
        >
          {tokens.logoUrl ? (
            <img
              src={tokens.logoUrl}
              alt="Your logo"
              className="max-w-full max-h-full object-contain"
            />
          ) : (
            <ImageFallback />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div
            className="text-[11px] font-semibold uppercase tracking-wide mb-1.5"
            style={{ color: brand.navyMuted }}
          >
            Brand colours
          </div>
          <div className="flex items-center gap-2">
            {tokens.primary && (
              <Swatch hex={tokens.primary} label="Primary" />
            )}
            {tokens.secondary && (
              <Swatch hex={tokens.secondary} label="Secondary" />
            )}
          </div>
          {tokens.extracting && (
            <div
              className="text-[10px] mt-1.5 flex items-center gap-1"
              style={{ color: brand.navyMuted }}
            >
              <Loader2 className="w-2.5 h-2.5 animate-spin" />
              Refining brand from your evidence — you can generate now.
            </div>
          )}
        </div>
      </div>

      <div className="mt-auto">
        <Button
          onClick={() => onGenerate("branded")}
          disabled={isGenerating}
          className="w-full text-sm text-white"
          style={{
            background: "linear-gradient(135deg, #0d9488 0%, #0f766e 100%)",
          }}
        >
          {isGenerating ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Generating…
            </>
          ) : (
            <>
              Generate with your branding
              <ArrowRight className="w-4 h-4 ml-2" />
            </>
          )}
        </Button>
      </div>
    </div>
  ) : (
    // Tokens missing — inline setup form.
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 mb-2">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: brand.tealBg }}
        >
          <Palette className="w-4 h-4" style={{ color: brand.teal }} />
        </div>
        <div className="text-sm font-bold" style={{ color: brand.navy }}>
          Set up your branding
        </div>
      </div>
      <p
        className="text-xs leading-relaxed mb-3"
        style={{ color: brand.navyMuted }}
      >
        Add your logo and website — we'll apply them automatically. You
        can refine this later in Settings.
      </p>

      {/* Logo drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onClick={() => fileInputRef.current?.click()}
        className="rounded-lg p-3 text-center cursor-pointer transition-colors mb-3"
        style={{
          backgroundColor: isDragging ? brand.tealBg : brand.slate,
          border: `1.5px dashed ${
            isDragging ? brand.teal : brand.border
          }`,
        }}
      >
        {tokens.logoUrl ? (
          <div className="flex items-center gap-3 justify-center">
            <img
              src={tokens.logoUrl}
              alt="Logo"
              className="max-h-10 max-w-[90px] object-contain bg-white rounded p-1"
            />
            <div
              className="text-[11px] font-medium"
              style={{ color: brand.teal }}
            >
              Logo uploaded — click to replace
            </div>
          </div>
        ) : uploadLogo.isPending ? (
          <div
            className="flex items-center justify-center gap-2 py-2"
            style={{ color: brand.navyMuted }}
          >
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-xs">Uploading…</span>
          </div>
        ) : (
          <div className="py-2">
            <Upload
              className="w-5 h-5 mx-auto mb-1"
              style={{ color: brand.navyMuted }}
            />
            <div
              className="text-xs font-medium"
              style={{ color: brand.navy }}
            >
              Drop logo or click to browse
            </div>
            <div
              className="text-[10px] mt-0.5"
              style={{ color: brand.navyMuted }}
            >
              PNG, JPG, SVG. Max 2MB.
            </div>
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          onChange={handleLogoPicker}
          className="hidden"
        />
      </div>

      {/* Website input */}
      <div className="mb-3">
        <Label
          htmlFor="brand-website"
          className="text-[11px] font-semibold uppercase tracking-wide mb-1 flex items-center gap-1"
          style={{ color: brand.navyMuted }}
        >
          <Globe className="w-3 h-3" />
          Website URL
        </Label>
        <Input
          id="brand-website"
          type="url"
          value={websiteUrl}
          onChange={(e) => setWebsiteUrl(e.target.value)}
          placeholder="yourcompany.co.uk"
          className="text-sm h-9"
        />
      </div>

      <div className="mt-auto">
        <Button
          onClick={handleSaveAndGenerate}
          disabled={isGenerating || busy || !tokens.logoUrl}
          className="w-full text-sm text-white"
          style={{
            background: tokens.logoUrl
              ? "linear-gradient(135deg, #0d9488 0%, #0f766e 100%)"
              : brand.navyMuted,
          }}
        >
          {isGenerating ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Generating…
            </>
          ) : !tokens.logoUrl ? (
            "Add a logo to continue"
          ) : (
            <>
              Save &amp; Generate
              <ArrowRight className="w-4 h-4 ml-2" />
            </>
          )}
        </Button>
      </div>
    </div>
  );

  // ── Render ─────────────────────────────────────────────────────

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto"
      style={{ backgroundColor: "rgba(15, 23, 42, 0.55)" }}
      onClick={() => {
        if (!isGenerating) onDismiss();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="brand-choice-title"
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-[860px] max-w-[94vw] my-6 relative"
        style={{ border: `1px solid ${brand.border}` }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close */}
        <button
          type="button"
          onClick={onDismiss}
          disabled={isGenerating}
          aria-label="Close"
          className="absolute top-4 right-4 p-1.5 rounded-lg transition-colors hover:bg-slate-100 disabled:opacity-50"
          style={{ color: brand.navyMuted }}
        >
          <X className="w-4 h-4" />
        </button>

        {/* Back link */}
        <button
          type="button"
          onClick={onBack}
          disabled={isGenerating}
          className="absolute top-4 left-4 text-xs font-medium flex items-center gap-1 hover:underline underline-offset-2 disabled:opacity-50"
          style={{ color: brand.navyMuted }}
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back
        </button>

        {/* Header */}
        <div className="px-8 pt-10 pb-4">
          <h2
            id="brand-choice-title"
            className="text-xl font-bold leading-snug"
            style={{ color: brand.navy }}
          >
            How should it look?
          </h2>
          <p
            className="text-sm mt-2 leading-relaxed"
            style={{ color: brand.navyMuted }}
          >
            Use your branding, or pick the template's built-in palette for
            a clean, neutral look.
          </p>
        </div>

        {/* Cards */}
        <div className="px-8 pb-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Card A — branded */}
            <div
              className="rounded-xl p-5 flex flex-col min-h-[340px]"
              style={{
                backgroundColor: brand.white,
                border: `2px solid ${brand.tealBorder}`,
                boxShadow: brand.shadow,
              }}
            >
              {cardBranded}
            </div>

            {/* Card B — template defaults */}
            <div
              className="rounded-xl p-5 flex flex-col min-h-[340px]"
              style={{
                backgroundColor: brand.white,
                border: `1px solid ${brand.border}`,
                boxShadow: brand.shadow,
              }}
            >
              <div className="flex items-center gap-2 mb-2">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: "#eef2ff" }}
                >
                  <div
                    className="w-4 h-4 rounded-sm"
                    style={{
                      background:
                        "linear-gradient(135deg, #1e1b4b 0%, #818cf8 100%)",
                    }}
                  />
                </div>
                <div
                  className="text-sm font-bold"
                  style={{ color: brand.navy }}
                >
                  Use template defaults
                </div>
              </div>
              <p
                className="text-xs leading-relaxed mb-3"
                style={{ color: brand.navyMuted }}
              >
                Clean navy &amp; violet template palette. No logo or
                brand-colour extraction needed — generate in one click.
              </p>

              {/* Palette preview */}
              <div
                className="rounded-lg p-4 flex items-center gap-3 mb-3"
                style={{
                  backgroundColor: brand.slate,
                  border: `1px solid ${brand.border}`,
                }}
              >
                <div className="flex gap-2 flex-1">
                  <Swatch hex="#1e1b4b" label="Chrome" />
                  <Swatch hex="#818cf8" label="Accent" />
                </div>
                <div
                  className="text-[11px] leading-tight text-right"
                  style={{ color: brand.navyMuted }}
                >
                  Template
                  <br />
                  defaults
                </div>
              </div>

              <div className="mt-auto">
                <Button
                  onClick={() => onGenerate("template")}
                  disabled={isGenerating}
                  variant="outline"
                  className="w-full text-sm"
                  style={{
                    borderColor: brand.border,
                    color: brand.navy,
                  }}
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Generating…
                    </>
                  ) : (
                    <>
                      Generate with template defaults
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Small helpers ──────────────────────────────────────────────────

function Swatch({ hex, label }: { hex: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <div
        className="w-6 h-6 rounded"
        style={{
          backgroundColor: hex,
          border: `1px solid ${brand.border}`,
        }}
        title={hex}
      />
      <div
        className="text-[10px] leading-tight"
        style={{ color: brand.navyMuted }}
      >
        {label}
        <br />
        <span style={{ color: brand.navy, fontWeight: 600 }}>{hex}</span>
      </div>
    </div>
  );
}

function ImageFallback() {
  return (
    <div
      className="w-8 h-8 rounded flex items-center justify-center"
      style={{ backgroundColor: brand.slate }}
    >
      <div
        className="text-[10px] font-bold tracking-wide"
        style={{ color: brand.navyMuted }}
      >
        LOGO
      </div>
    </div>
  );
}
