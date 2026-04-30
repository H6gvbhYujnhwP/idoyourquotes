/**
 * BrochureSettingsTab.tsx
 *
 * Phase 4B Delivery B. The Company Brochure tab inside the Settings
 * page. Three states:
 *
 *   1. Tier-locked — Solo / Trial users see a soft upgrade card with a
 *      link to the Pricing page. They CAN see this tab, they just
 *      can't upload (the server blocks them too — defence in depth).
 *
 *   2. No brochure — empty-state card with a primary "Upload brochure"
 *      button that opens the BrochureUploadModal.
 *
 *   3. Has brochure — shows brochure metadata (filename, pages,
 *      uploaded date), a summary of what was extracted (per-tag counts,
 *      flagged thinness reasons if any), plus actions: Replace, Re-
 *      extract, Delete.
 *
 * Lives in its own file (rather than inline in Settings.tsx) to keep
 * the delta to Settings.tsx surgical — only an import + tab entry +
 * one render line. Settings.tsx is 2,025 lines; full-file replacement
 * for a multi-line edit is risky. Better to import a self-contained
 * component.
 *
 * Wiring into Settings.tsx happens as the third file in this delivery.
 */

import { useState } from "react";
import {
  BookOpen,
  Upload,
  Trash2,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Crown,
  Loader2,
  FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import BrochureUploadModal from "@/components/BrochureUploadModal";

// Same allowed list the server uses. Kept in sync manually — there's
// only two places (this file + the two server routers).
const ALLOWED_TIERS = ["pro", "team"];

// Tag → display label, used by the "What we extracted" breakdown.
const TAG_LABELS: Record<string, string> = {
  cover: "Cover",
  contents: "Contents",
  about: "About us",
  usp: "USPs",
  "track-record": "Track record",
  service: "Services",
  testimonial: "Testimonials",
  contact: "Contact",
  other: "Other",
};

// Tag display order — most-meaningful first.
const TAG_ORDER = ["about", "usp", "track-record", "service", "testimonial", "contact", "cover", "contents", "other"];

function formatBytes(bytes: number | null | undefined): string {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(d: string | Date | null | undefined): string {
  if (!d) return "";
  const dt = typeof d === "string" ? new Date(d) : d;
  return dt.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function BrochureSettingsTab() {
  const utils = trpc.useUtils();
  const subStatus = trpc.subscription.status.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });
  const brochureQuery = trpc.brochure.get.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });

  const reExtractMut = trpc.brochure.reExtract.useMutation();
  const deleteMut = trpc.brochure.delete.useMutation();
  // Phase 4B Delivery E.4 — orientation preference for Tile 3 renders.
  const setOrientationMut = trpc.brochure.setProposalOrientation.useMutation();

  const [uploadOpen, setUploadOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [orientationSaving, setOrientationSaving] = useState<string | null>(null);

  const tier = subStatus.data?.tier;
  const tierAllowed = tier ? ALLOWED_TIERS.includes(tier) : false;
  const brochure = brochureQuery.data;

  async function handleReExtract() {
    setActionError(null);
    try {
      await reExtractMut.mutateAsync();
      await utils.brochure.get.invalidate();
    } catch (err: any) {
      setActionError(err?.message || "Re-extract failed.");
    }
  }

  async function handleDelete() {
    setActionError(null);
    try {
      await deleteMut.mutateAsync();
      await utils.brochure.get.invalidate();
      setConfirmDelete(false);
    } catch (err: any) {
      setActionError(err?.message || "Delete failed.");
    }
  }

  async function handleOrientationChange(
    orientation: "auto" | "portrait" | "landscape",
  ) {
    setActionError(null);
    setOrientationSaving(orientation);
    try {
      await setOrientationMut.mutateAsync({ orientation });
      await utils.brochure.get.invalidate();
    } catch (err: any) {
      setActionError(err?.message || "Could not save orientation preference.");
    } finally {
      setOrientationSaving(null);
    }
  }

  // ── Loading skeleton ──────────────────────────────────────────────
  if (brochureQuery.isLoading || subStatus.isLoading) {
    return (
      <div className="space-y-4">
        <Card>
          <CardContent className="py-12 flex items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Tier-locked state ─────────────────────────────────────────────
  if (!tierAllowed) {
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5" />
              Company Brochure
            </CardTitle>
            <CardDescription>
              Upload your brochure once and the AI will weave your About Us,
              USPs, and infographics into every Branded Proposal.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 flex items-start gap-3">
              <Crown className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <p className="font-medium text-amber-900 mb-1">
                  Available on Pro and Team plans
                </p>
                <p className="text-sm text-amber-800 mb-3">
                  Branded Proposals with your brochure are part of the Pro
                  and Team plans. Upgrade to upload a brochure and unlock
                  the new branded proposal mode.
                </p>
                <Button asChild>
                  <a href="/pricing">Upgrade plan</a>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── No brochure state ─────────────────────────────────────────────
  if (!brochure) {
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5" />
              Company Brochure
            </CardTitle>
            <CardDescription>
              Upload your brochure once and the AI will weave your About Us,
              USPs, and infographics into every Branded Proposal.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border-2 border-dashed border-muted p-10 text-center">
              <div className="mx-auto h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-3">
                <Upload className="h-5 w-5 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium mb-1">No brochure uploaded yet</p>
              <p className="text-xs text-muted-foreground mb-4">
                PDF only · max 30 pages · max 25 MB
              </p>
              <Button onClick={() => setUploadOpen(true)}>
                <Upload className="h-4 w-4 mr-2" />
                Upload brochure
              </Button>
            </div>
          </CardContent>
        </Card>

        <BrochureUploadModal
          open={uploadOpen}
          onOpenChange={setUploadOpen}
        />
      </div>
    );
  }

  // ── Has brochure state ────────────────────────────────────────────
  const knowledge = brochure.knowledge as any;
  const classifications = knowledge?.classifications || [];

  // Aggregate tag counts for the "what we extracted" breakdown
  const tagCounts = new Map<string, number>();
  const tagFactCounts = new Map<string, number>();
  for (const c of classifications) {
    tagCounts.set(c.tag, (tagCounts.get(c.tag) || 0) + 1);
    tagFactCounts.set(c.tag, (tagFactCounts.get(c.tag) || 0) + (c.facts?.length || 0));
  }
  const totalFacts = Array.from(tagFactCounts.values()).reduce((a, b) => a + b, 0);
  const cleanPageCount = classifications.filter((c: any) => c.clarity === "clean").length;

  // Detect thinness for the inline warning
  const hasAbout = classifications.some(
    (c: any) => c.clarity === "clean" && c.tag === "about",
  );
  const hasUsp = classifications.some(
    (c: any) => c.clarity === "clean" && c.tag === "usp",
  );
  const thinReasons: string[] = [];
  if (!hasAbout) thinReasons.push("No clear About Us page found");
  if (!hasUsp) thinReasons.push("No clear Why Choose Us / USP page found");
  if (totalFacts < 5) thinReasons.push("Few extractable facts — proposals may be sparse");

  const reExtractBusy = reExtractMut.isPending;
  const deleteBusy = deleteMut.isPending;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            Company Brochure
          </CardTitle>
          <CardDescription>
            Used on every Branded Proposal you generate. Upload a new brochure
            to replace; existing proposals keep using the version they were
            built against.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Brochure summary */}
          <div className="rounded-lg border p-4 flex gap-4">
            <div className="h-14 w-11 rounded bg-muted border flex items-center justify-center flex-shrink-0">
              <FileText className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <p className="font-medium truncate">{brochure.filename}</p>
                <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-2 py-0.5">
                  <CheckCircle2 className="h-3 w-3" />
                  Extracted
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                {brochure.pageCount ?? 0} pages
                {brochure.fileSize ? ` · ${formatBytes(brochure.fileSize)}` : ""}
                {brochure.extractedAt
                  ? ` · uploaded ${formatDate(brochure.extractedAt)}`
                  : ""}
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setUploadOpen(true)}
                disabled={reExtractBusy || deleteBusy}
              >
                <Upload className="h-3.5 w-3.5 mr-1.5" />
                Replace
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleReExtract}
                disabled={reExtractBusy || deleteBusy}
              >
                {reExtractBusy ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                )}
                Re-extract
              </Button>
            </div>
          </div>

          {/* Thin-brochure warning, if any */}
          {thinReasons.length > 0 && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
              <div className="flex-1 text-sm">
                <p className="font-medium text-amber-900 mb-0.5">
                  This brochure may produce sparse proposals
                </p>
                <ul className="text-amber-800 list-disc list-inside text-xs space-y-0.5">
                  {thinReasons.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* What we extracted */}
          <div>
            <p className="text-sm font-medium mb-2">What we extracted</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {TAG_ORDER.filter((tag) => tagCounts.has(tag)).map((tag) => {
                const pages = tagCounts.get(tag) || 0;
                const facts = tagFactCounts.get(tag) || 0;
                return (
                  <div
                    key={tag}
                    className="rounded-md bg-muted/40 px-3 py-2 text-xs"
                  >
                    <p className="font-medium text-foreground">
                      {TAG_LABELS[tag] || tag}
                    </p>
                    <p className="text-muted-foreground mt-0.5">
                      {pages} page{pages === 1 ? "" : "s"}
                      {facts > 0 ? ` · ${facts} fact${facts === 1 ? "" : "s"}` : ""}
                    </p>
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {cleanPageCount} of {brochure.pageCount} pages can be embedded
              verbatim in proposals.
            </p>
          </div>

          {/* Phase 4B Delivery E.4 — proposal orientation preference.
              Affects branded proposal renders only. Default 'auto'
              produces an A4 portrait proposal regardless of brochure
              shape (the safest default for tender / contract docs).
              Suppliers with landscape brochures whose pages would
              otherwise be letterboxed at small sizes can opt into a
              landscape-throughout proposal. */}
          <div className="border-t pt-4">
            <p className="text-sm font-medium mb-1">Proposal orientation</p>
            <p className="text-xs text-muted-foreground mb-3">
              Controls how branded proposals are laid out. Most proposals
              should stay portrait — landscape suits suppliers whose
              brochure is landscape and whose narrative pages should match.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {[
                {
                  value: "auto" as const,
                  label: "Portrait (default)",
                  hint: "A4 portrait throughout",
                },
                {
                  value: "portrait" as const,
                  label: "Portrait (always)",
                  hint: "Same as default for now",
                },
                {
                  value: "landscape" as const,
                  label: "Landscape",
                  hint: "A4 landscape throughout",
                },
              ].map((opt) => {
                const active =
                  (brochure.proposalOrientation ?? "auto") === opt.value;
                const saving = orientationSaving === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => handleOrientationChange(opt.value)}
                    disabled={saving || reExtractBusy || deleteBusy || active}
                    className={`text-left rounded-md border px-3 py-2 transition ${
                      active
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/50 hover:bg-muted/40"
                    } ${
                      saving || reExtractBusy || deleteBusy
                        ? "opacity-60 cursor-not-allowed"
                        : ""
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium">{opt.label}</p>
                      {saving && (
                        <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                      )}
                      {active && !saving && (
                        <CheckCircle2 className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {opt.hint}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Action error */}
          {actionError && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              {actionError}
            </div>
          )}

          {/* Delete confirmation */}
          <div className="border-t pt-4">
            {!confirmDelete ? (
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={() => setConfirmDelete(true)}
                disabled={reExtractBusy || deleteBusy}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                Delete brochure
              </Button>
            ) : (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 space-y-2">
                <p className="text-sm font-medium">Delete this brochure?</p>
                <p className="text-xs text-muted-foreground">
                  Saved proposals that already use it will keep working.
                  New Branded Proposals won't be available until you re-upload.
                </p>
                <div className="flex gap-2 pt-1">
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={handleDelete}
                    disabled={deleteBusy}
                  >
                    {deleteBusy ? (
                      <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                    )}
                    Yes, delete
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setConfirmDelete(false)}
                    disabled={deleteBusy}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <BrochureUploadModal open={uploadOpen} onOpenChange={setUploadOpen} />
    </div>
  );
}
