import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusPill, statusLabel } from "@/components/StatusPill";
import { trpc } from "@/lib/trpc";
import {
  Plus,
  FileText,
  MoreHorizontal,
  Search,
  Crown,
  ArrowRight,
  AlertTriangle,
  Sparkles,
  X,
} from "lucide-react";
import { useLocation } from "wouter";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

/**
 * Dashboard (v2) — brand-refreshed quotes list.
 *
 * Changes from v1:
 *  - Header: title + subtitle summary (N total · N draft · N awaiting
 *    response), replacing the 4 stats cards at the top of the page.
 *  - Filter pills use v2 terminology: Won (=accepted), Lost (=declined),
 *    PDF Generated (new enum value, first use is here in the filter
 *    row; auto-flip on PDF download lands in PR-Beta).
 *  - The quote list is now a proper HTML table (Client / Sector /
 *    Status / Total / Updated / ⋯) instead of a divided div-list.
 *  - Seed-catalog nudge and Load Example Quote preserved; restyled to
 *    brand tokens. Upgrade modal and dialogs preserved verbatim.
 *  - New Quote button now creates a quote in a single click and jumps
 *    straight to the unified workspace — the old Simple/Tender chooser
 *    dialog has been removed as part of the Phase 4 unified-flow move.
 *    Format choice (Simple quote / Contract / Project) moves to
 *    export-time, not quote-creation-time.
 */

type QuoteStatus = "draft" | "sent" | "accepted" | "declined" | "pdf_generated";

interface QuoteData {
  id: number;
  title: string | null;
  reference: string | null;
  clientName: string | null;
  status: string;
  total: string | null;
  monthlyTotal?: string | null;
  annualTotal?: string | null;
  description?: string | null;
  createdAt: Date | string;
  updatedAt?: Date | string;
  quoteMode?: string | null;
  tradePreset?: string | null;
}

const FILTER_OPTIONS: Array<{ value: QuoteStatus | "all"; label: string }> = [
  { value: "all", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "sent", label: "Sent" },
  { value: "pdf_generated", label: "PDF Generated" },
  { value: "accepted", label: "Won" },
  { value: "declined", label: "Lost" },
];

/** Relative time — small helper so we don't pull in date-fns for one use. */
function relativeTime(date: Date | string | undefined | null): string {
  if (!date) return "—";
  const then = new Date(date).getTime();
  if (isNaN(then)) return "—";
  const sec = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  if (d < 7) return `${d}d ago`;
  const w = Math.floor(d / 7);
  if (w < 5) return `${w}w ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  const y = Math.floor(d / 365);
  return `${y}y ago`;
}

export default function Dashboard() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<QuoteStatus | "all">("all");

  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [deleteConfirmTitle, setDeleteConfirmTitle] = useState<string>("");

  // Upgrade modal state — shown when quota blocks quote creation
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [upgradeReason, setUpgradeReason] = useState("");

  const { data: quotes, isLoading, refetch } = trpc.quotes.list.useQuery();
  const { data: tradePresets } = trpc.quotes.getTradePresets.useQuery();

  // Client-side sector-label lookup. Same query drives the create dialog
  // and the Sector column in the table — TanStack caches it across the
  // page so this is essentially free.
  const sectorLabels = useMemo<Record<string, string>>(() => {
    const lookup: Record<string, string> = {};
    (tradePresets || []).forEach((p: any) => {
      if (p?.key && p?.name) lookup[p.key] = p.name;
    });
    return lookup;
  }, [tradePresets]);

  const createQuote = trpc.quotes.create.useMutation({
    onSuccess: data => {
      setLocation(`/quotes/${data.id}`);
    },
    onError: error => {
      const msg = error.message || "";
      if (
        msg.includes("monthly limit") ||
        msg.includes("trial has expired") ||
        msg.includes("cancelled") ||
        msg.includes("past due") ||
        msg.includes("unpaid")
      ) {
        setUpgradeReason(msg);
        setShowUpgradeModal(true);
      } else {
        toast.error("Failed to create quote: " + error.message);
      }
    },
  });

  // Subscription usage
  const { data: subStatus } = trpc.subscription.status.useQuery();

  // Catalog items — used to decide whether to show the seed-catalog nudge.
  const { data: catalogItems } = trpc.catalog.list.useQuery();

  // ── Seed-catalog nudge ──────────────────────────────────────────────────
  // Kept from v1. Shown to users on GTM sectors with empty catalogs who
  // haven't dismissed. Restyled to brand tokens; logic unchanged.
  const SEEDABLE_SECTORS = [
    "it_services",
    "website_marketing",
    "commercial_cleaning",
    "pest_control",
  ];
  const [nudgeDismissed, setNudgeDismissed] = useState(false);

  useEffect(() => {
    const uid = (user as any)?.id;
    if (!uid) return;
    try {
      const stored = localStorage.getItem(
        `idyq-seedcatalog-nudge-dismissed:${uid}`
      );
      setNudgeDismissed(stored === "true");
    } catch {
      // localStorage unavailable — treat as not dismissed for this session.
    }
  }, [(user as any)?.id]);

  const handleDismissNudge = () => {
    const uid = (user as any)?.id;
    if (uid) {
      try {
        localStorage.setItem(
          `idyq-seedcatalog-nudge-dismissed:${uid}`,
          "true"
        );
      } catch {
        // non-fatal — in-memory dismiss still takes effect for this session
      }
    }
    setNudgeDismissed(true);
  };

  const handleSeedNudgeClick = () => {
    setLocation("/catalog?seed=1");
  };

  const seedDemoForSector = trpc.quotes.seedDemoForSector.useMutation({
    onSuccess: data => {
      if (data?.quoteId) {
        refetch();
        if (data.seeded) {
          toast.success("Example quote added to your list");
        }
        setLocation(`/quote/${data.quoteId}`);
      } else {
        toast.error(
          "Couldn't load an example quote for this sector — set a sector in Settings and try again."
        );
      }
    },
    onError: error => {
      toast.error("Failed to load example quote: " + error.message);
    },
  });

  const handleLoadExampleQuote = () => {
    seedDemoForSector.mutate();
  };

  const userSector = (user as any)?.defaultTradeSector as
    | string
    | null
    | undefined;
  // Phase 4B Delivery E.12 — banner now shows for all seedable-sector
  // users until they dismiss it, regardless of catalogue state. Was
  // previously gated to "catalogItems?.length === 0", which meant new
  // users who registered with a successfully auto-seeded sector
  // (every GTM sector seeds at registration) never saw any prompt to
  // tailor their starter catalogue before their first quote — the
  // gap that motivated this delivery. Tailoring (rates, buy-in
  // costs, descriptions) is the lever that turns a generic AI quote
  // into one that actually reflects the user's pricing.
  const showSeedNudge =
    !!userSector &&
    SEEDABLE_SECTORS.includes(userSector) &&
    !nudgeDismissed;

  const deleteQuote = trpc.quotes.delete.useMutation({
    onSuccess: data => {
      toast.success(
        `Quote deleted${
          data.deletedFilesCount > 0
            ? ` (${data.deletedFilesCount} files removed)`
            : ""
        }`
      );
      refetch();
      setDeleteConfirmId(null);
    },
    onError: error => {
      toast.error("Failed to delete quote: " + error.message);
    },
  });

  const duplicateQuote = trpc.quotes.duplicate.useMutation({
    onSuccess: data => {
      toast.success("Quote duplicated successfully");
      setLocation(`/quotes/${data.id}`);
    },
    onError: error => {
      toast.error("Failed to duplicate quote: " + error.message);
    },
  });

  const handleDuplicateClick = (e: React.MouseEvent, quoteId: number) => {
    e.stopPropagation();
    duplicateQuote.mutate({ id: quoteId });
  };

  const handleCreateQuote = () => {
    if (subStatus?.canCreateQuote === false) {
      setUpgradeReason(
        subStatus.quoteBlockReason ||
          "You've reached your plan's limit. Upgrade to create more quotes."
      );
      setShowUpgradeModal(true);
      return;
    }
    // Phase 4 unified flow: quotes are created with server defaults
    // (quoteMode = "simple") and the format choice happens at export-time
    // from within the workspace. No upfront type chooser.
    createQuote.mutate();
  };

  const handleDeleteClick = (e: React.MouseEvent, quote: QuoteData) => {
    e.stopPropagation();
    setDeleteConfirmId(quote.id);
    setDeleteConfirmTitle(
      quote.title || quote.reference || `Quote #${quote.id}`
    );
  };

  const handleConfirmDelete = () => {
    if (deleteConfirmId) {
      deleteQuote.mutate({ id: deleteConfirmId });
    }
  };

  const filteredQuotes = (quotes as QuoteData[] | undefined)?.filter(quote => {
    const matchesSearch =
      !searchQuery ||
      quote.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      quote.clientName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      quote.reference?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus =
      statusFilter === "all" || quote.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const stats = {
    total: quotes?.length || 0,
    draft:
      (quotes as QuoteData[] | undefined)?.filter(q => q.status === "draft")
        .length || 0,
    awaitingResponse:
      (quotes as QuoteData[] | undefined)?.filter(q => q.status === "sent")
        .length || 0,
  };

  return (
    <div className="space-y-5">
      {/* ── Header ───────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1
            className="text-xl"
            style={{ fontWeight: 500, color: "var(--brand-text-primary)" }}
          >
            Quotes
          </h1>
          <p
            className="text-sm mt-1"
            style={{ color: "var(--brand-text-secondary)" }}
          >
            {stats.total} total · {stats.draft} draft · {stats.awaitingResponse}{" "}
            awaiting response
          </p>
        </div>
        <div className="flex items-center gap-3">
          {subStatus?.quoteUsage && subStatus.quoteUsage.max > 0 && (
            <span
              className="text-xs"
              style={{ color: "var(--brand-text-tertiary)" }}
            >
              {subStatus.quoteUsage.current} of {subStatus.quoteUsage.max}{" "}
              quotes used
            </span>
          )}
          <Button
            onClick={handleCreateQuote}
            disabled={createQuote.isPending}
            style={{
              background: "var(--brand-primary-gradient)",
              color: "#ffffff",
              border: "none",
              fontWeight: 500,
            }}
          >
            <Plus className="mr-2 h-4 w-4" />
            New quote
          </Button>
        </div>
      </div>

      {/* ── Catalogue-tailoring nudge (Phase 4B Delivery E.12) ─── */}
      {showSeedNudge && (
        <div
          className="rounded-lg border flex items-start gap-3 py-4 px-5"
          style={{
            background: "var(--brand-teal-pale)",
            borderColor: "var(--brand-teal-border)",
          }}
        >
          <div className="shrink-0 mt-0.5">
            <Sparkles
              className="h-5 w-5"
              style={{ color: "var(--brand-teal)" }}
            />
          </div>
          <div className="flex-1 min-w-0">
            <div
              className="font-medium mb-0.5"
              style={{ color: "var(--brand-text-primary)" }}
            >
              Your starter catalogue is ready
            </div>
            <p
              className="text-sm"
              style={{ color: "var(--brand-text-secondary)" }}
            >
              We've pre-loaded the common products and services for your sector at indicative UK rates — you can quote with it straight away. Tweak prices and add buy-in costs over time as you sell things.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {/* Single static CTA. With auto-seed on registration, every
                seedable-sector signup lands with a fully-populated
                catalogue. The nudge is now purely a tailor-the-catalogue
                prompt — there's no "load" state to differentiate. The
                /catalog?seed=1 param is preserved as a no-op for any
                pre-auto-seed legacy account whose catalogue is still
                empty; the Catalog page's empty-state Recover affordance
                covers that case. */}
            <Button
              onClick={handleSeedNudgeClick}
              size="sm"
              style={{
                background: "var(--brand-primary-gradient)",
                color: "#ffffff",
                border: "none",
              }}
            >
              <Sparkles className="mr-2 h-4 w-4" />
              Open Catalogue
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              style={{ color: "var(--brand-teal-dark)" }}
              onClick={handleDismissNudge}
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* ── Filter pills + search ──────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex gap-2 flex-wrap">
          {FILTER_OPTIONS.map(opt => {
            const active = statusFilter === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => setStatusFilter(opt.value)}
                className="px-3 py-1.5 text-xs rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                style={{
                  background: active ? "var(--brand-teal-pale)" : "#ffffff",
                  border: `1px solid ${
                    active
                      ? "var(--brand-teal-border)"
                      : "var(--brand-border-light)"
                  }`,
                  color: active
                    ? "var(--brand-teal-dark)"
                    : "var(--brand-text-secondary)",
                  fontWeight: active ? 500 : 400,
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
        <div className="relative w-full sm:w-64">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4"
            style={{ color: "var(--brand-text-tertiary)" }}
          />
          <Input
            placeholder="Search quotes..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* ── Quotes table ───────────────────────────────────────── */}
      <div
        className="rounded-lg border overflow-hidden"
        style={{
          borderColor: "var(--brand-border)",
          background: "var(--brand-bg)",
        }}
      >
        {isLoading ? (
          <div
            className="p-8 text-center text-sm"
            style={{ color: "var(--brand-text-secondary)" }}
          >
            Loading quotes...
          </div>
        ) : !filteredQuotes?.length ? (
          <div className="p-10 text-center">
            <FileText
              className="h-12 w-12 mx-auto mb-4"
              style={{ color: "var(--brand-text-tertiary)" }}
            />
            <h3
              className="text-base mb-2"
              style={{
                fontWeight: 500,
                color: "var(--brand-text-primary)",
              }}
            >
              {statusFilter === "all" && !searchQuery
                ? "No quotes yet"
                : "No quotes match your filters"}
            </h3>
            <p
              className="text-sm mb-4"
              style={{ color: "var(--brand-text-secondary)" }}
            >
              {statusFilter === "all" && !searchQuery
                ? "Create your first quote to get started."
                : "Try a different filter or search term."}
            </p>
            {statusFilter === "all" && !searchQuery && (
              <Button
                onClick={handleCreateQuote}
                disabled={createQuote.isPending}
                style={{
                  background: "var(--brand-primary-gradient)",
                  color: "#ffffff",
                  border: "none",
                }}
              >
                <Plus className="mr-2 h-4 w-4" />
                New quote
              </Button>
            )}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr
                style={{
                  background: "var(--brand-bg-tinted)",
                  borderBottom: `1px solid ${"var(--brand-border)"}`,
                }}
              >
                <th
                  className="text-left px-4 py-2.5"
                  style={{
                    fontSize: "0.625rem",
                    fontWeight: 500,
                    letterSpacing: "0.05em",
                    textTransform: "uppercase",
                    color: "var(--brand-text-tertiary)",
                  }}
                >
                  Client
                </th>
                <th
                  className="text-left px-4 py-2.5"
                  style={{
                    fontSize: "0.625rem",
                    fontWeight: 500,
                    letterSpacing: "0.05em",
                    textTransform: "uppercase",
                    color: "var(--brand-text-tertiary)",
                  }}
                >
                  Sector
                </th>
                <th
                  className="text-left px-4 py-2.5"
                  style={{
                    fontSize: "0.625rem",
                    fontWeight: 500,
                    letterSpacing: "0.05em",
                    textTransform: "uppercase",
                    color: "var(--brand-text-tertiary)",
                  }}
                >
                  Status
                </th>
                <th
                  className="text-right px-4 py-2.5"
                  style={{
                    fontSize: "0.625rem",
                    fontWeight: 500,
                    letterSpacing: "0.05em",
                    textTransform: "uppercase",
                    color: "var(--brand-text-tertiary)",
                  }}
                >
                  Total
                </th>
                {/* Phase 4B Delivery E.9 — internal-only profit + margin
                    columns. Sourced from the quotes.list aggregating
                    helper which LEFT JOINs line items and SUMs in SQL.
                    Plain text, no threshold colouring (per spec). */}
                <th
                  className="text-right px-4 py-2.5"
                  style={{
                    fontSize: "0.625rem",
                    fontWeight: 500,
                    letterSpacing: "0.05em",
                    textTransform: "uppercase",
                    color: "var(--brand-text-tertiary)",
                  }}
                  title="Internal — sum of (rate − cost) × qty across all lines"
                >
                  Profit
                </th>
                <th
                  className="text-right px-4 py-2.5"
                  style={{
                    fontSize: "0.625rem",
                    fontWeight: 500,
                    letterSpacing: "0.05em",
                    textTransform: "uppercase",
                    color: "var(--brand-text-tertiary)",
                  }}
                  title="Profit ÷ revenue across all lines"
                >
                  Margin
                </th>
                <th
                  className="text-right px-4 py-2.5"
                  style={{
                    fontSize: "0.625rem",
                    fontWeight: 500,
                    letterSpacing: "0.05em",
                    textTransform: "uppercase",
                    color: "var(--brand-text-tertiary)",
                  }}
                >
                  Updated
                </th>
                <th className="w-10 px-2 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {filteredQuotes.map(quote => {
                const sectorKey = quote.tradePreset || "";
                const sectorName = sectorKey ? sectorLabels[sectorKey] : null;
                const total = parseFloat(quote.total || "0");
                const monthlyTotal = parseFloat(
                  (quote.monthlyTotal as string) || "0"
                );
                const annualTotal = parseFloat(
                  (quote.annualTotal as string) || "0"
                );

                // Totals display priority:
                //   - If one-off total > 0, show it as primary (with monthly/annual as small lines below).
                //   - Else if monthly > 0, show monthly as primary (£X.XX/mo).
                //   - Else if annual > 0, show annual as primary (£X.XX/yr).
                //   - Else fall back to £0.00.
                // This prevents a pure-recurring quote (e.g. a managed service)
                // from misleadingly showing "£0.00" at a glance.
                type TotalLine = { value: number; suffix: string };
                const lines: TotalLine[] = [];
                if (total > 0) lines.push({ value: total, suffix: "" });
                if (monthlyTotal > 0) lines.push({ value: monthlyTotal, suffix: "/mo" });
                if (annualTotal > 0) lines.push({ value: annualTotal, suffix: "/yr" });
                const primary: TotalLine = lines[0] ?? { value: 0, suffix: "" };
                const secondaryLines = lines.slice(1);
                const formatGBP = (v: number) =>
                  v.toLocaleString("en-GB", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  });

                const clientDisplay =
                  quote.clientName || quote.reference || `Quote #${quote.id}`;
                const descriptionPreview =
                  quote.title ||
                  quote.description ||
                  (quote.clientName ? quote.reference : null) ||
                  null;

                return (
                  <tr
                    key={quote.id}
                    onClick={() => setLocation(`/quotes/${quote.id}`)}
                    className="cursor-pointer transition-colors border-t hover:[background:var(--brand-teal-pale)]"
                    style={{ borderColor: "var(--brand-border)" }}
                  >
                    {/* Client */}
                    <td className="px-4 py-3">
                      <div
                        className="flex items-center gap-2 min-w-0"
                        style={{ color: "var(--brand-text-primary)" }}
                      >
                        <span
                          className="truncate"
                          style={{ fontWeight: 500 }}
                        >
                          {clientDisplay}
                        </span>
                        {quote.quoteMode === "comprehensive" && (
                          <Badge
                            variant="outline"
                            className="text-[10px] shrink-0"
                          >
                            Tender Pack
                          </Badge>
                        )}
                      </div>
                      {descriptionPreview &&
                        descriptionPreview !== clientDisplay && (
                          <div
                            className="text-xs truncate mt-0.5"
                            style={{ color: "var(--brand-text-tertiary)" }}
                          >
                            {descriptionPreview}
                          </div>
                        )}
                    </td>

                    {/* Sector */}
                    <td className="px-4 py-3">
                      {sectorName ? (
                        <span
                          className="inline-flex items-center px-2 py-0.5 rounded text-[10px]"
                          style={{
                            background: "var(--brand-teal-pale)",
                            color: "var(--brand-teal-dark)",
                            fontWeight: 500,
                          }}
                        >
                          {sectorName}
                        </span>
                      ) : (
                        <span
                          className="text-xs"
                          style={{ color: "var(--brand-text-tertiary)" }}
                        >
                          —
                        </span>
                      )}
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3">
                      <StatusPill status={quote.status} />
                    </td>

                    {/* Total */}
                    <td className="px-4 py-3 text-right">
                      <div
                        style={{
                          fontWeight: 500,
                          color: "var(--brand-text-primary)",
                        }}
                      >
                        £{formatGBP(primary.value)}{primary.suffix}
                      </div>
                      {secondaryLines.map((line, idx) => (
                        <div
                          key={idx}
                          className="text-[11px] mt-0.5"
                          style={{ color: "var(--brand-text-tertiary)" }}
                        >
                          + £{formatGBP(line.value)}{line.suffix}
                        </div>
                      ))}
                    </td>

                    {/* Phase 4B Delivery E.9 — Profit + Margin cells.
                        Sourced from the totalProfit and totalCost
                        aggregates the list helper now returns.
                        Revenue for the margin denominator is the sum
                        of all line totals (including monthly + annual
                        + one-off) — same scope as totalProfit so the
                        % is internally consistent. Shows a muted dash
                        when no costs are entered.
                        Phase 4B Delivery E.11 — "any costs entered"
                        is now decided by linesWithCost, an aggregate
                        count of lines where cost_price IS NOT NULL.
                        Previously we used totalCost > 0, which
                        falsely hid profit/margin on quotes where every
                        line is genuinely passthrough (cost = 0
                        explicitly). With linesWithCost, a passthrough-
                        only quote correctly shows 100% margin. */}
                    {(() => {
                      const profit = parseFloat(
                        ((quote as any).totalProfit as string) || "0",
                      );
                      const cost = parseFloat(
                        ((quote as any).totalCost as string) || "0",
                      );
                      const linesWithCost =
                        ((quote as any).linesWithCost as number) || 0;
                      const revenue = profit + cost;
                      const hasCost = linesWithCost > 0;
                      const marginPct =
                        hasCost && revenue > 0 ? (profit / revenue) * 100 : null;
                      return (
                        <>
                          <td className="px-4 py-3 text-right">
                            {hasCost ? (
                              <span
                                style={{
                                  fontWeight: 500,
                                  color: "var(--brand-text-primary)",
                                }}
                              >
                                £{formatGBP(profit)}
                              </span>
                            ) : (
                              <span
                                style={{ color: "var(--brand-text-tertiary)" }}
                              >
                                —
                              </span>
                            )}
                          </td>
                          <td
                            className="px-4 py-3 text-right text-xs"
                            style={{ color: "var(--brand-text-secondary)" }}
                          >
                            {marginPct === null
                              ? "—"
                              : `${marginPct.toFixed(1)}%`}
                          </td>
                        </>
                      );
                    })()}

                    {/* Updated */}
                    <td
                      className="px-4 py-3 text-right text-xs"
                      style={{ color: "var(--brand-text-secondary)" }}
                    >
                      {relativeTime(quote.updatedAt || quote.createdAt)}
                    </td>

                    {/* Actions */}
                    <td className="px-2 py-3 w-10">
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          asChild
                          onClick={e => e.stopPropagation()}
                        >
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            aria-label="Quote actions"
                          >
                            <MoreHorizontal
                              className="h-4 w-4"
                              style={{
                                color: "var(--brand-text-tertiary)",
                              }}
                            />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={e => {
                              e.stopPropagation();
                              setLocation(`/quotes/${quote.id}`);
                            }}
                          >
                            Open
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={e => handleDuplicateClick(e, quote.id)}
                            disabled={duplicateQuote.isPending}
                          >
                            {duplicateQuote.isPending
                              ? "Duplicating..."
                              : "Duplicate"}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={e => handleDeleteClick(e, quote)}
                          >
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Live-region announcer for status filter changes (a11y) —
          non-visual, useful when the pills change what's shown. */}
      <div className="sr-only" aria-live="polite">
        Showing {filteredQuotes?.length || 0} quote
        {filteredQuotes?.length === 1 ? "" : "s"}
        {statusFilter !== "all" ? ` with status ${statusLabel(statusFilter)}` : ""}
      </div>

      {/* ── Delete Confirmation Dialog (preserved) ────────────── */}
      <AlertDialog
        open={deleteConfirmId !== null}
        onOpenChange={open => !open && setDeleteConfirmId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Quote</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteConfirmTitle}"? This will
              permanently remove the quote and all associated files. This
              action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteQuote.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={deleteQuote.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteQuote.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Upgrade Modal (preserved) ─────────────────────────── */}
      <Dialog open={showUpgradeModal} onOpenChange={setShowUpgradeModal}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-1">
              <div
                className="flex items-center justify-center w-10 h-10 rounded-full"
                style={{ backgroundColor: "var(--brand-teal-pale)" }}
              >
                <Crown
                  className="h-5 w-5"
                  style={{ color: "var(--brand-teal)" }}
                />
              </div>
              <div>
                <DialogTitle className="text-lg">Upgrade Your Plan</DialogTitle>
              </div>
            </div>
            <DialogDescription className="pt-2 text-sm leading-relaxed">
              {upgradeReason || "You've reached your current plan's limits."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            {/* Current usage */}
            {subStatus && (subStatus.maxQuotesPerMonth as number) !== -1 && (
              <div className="p-3 rounded-lg bg-gray-50 border">
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-muted-foreground">
                    Quotes used this month
                  </span>
                  <span className="font-semibold">
                    {subStatus.currentQuoteCount} /{" "}
                    {subStatus.maxQuotesPerMonth}
                  </span>
                </div>
                <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{ width: "100%", backgroundColor: "#ef4444" }}
                  />
                </div>
              </div>
            )}

            {/* Trial expired info */}
            {subStatus?.isTrialExpired && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200">
                <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-amber-700">
                  Your 14-day free trial has ended. Choose a plan below to
                  continue creating professional quotes.
                </p>
              </div>
            )}

            {/* Quick plan comparison */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Available plans
              </p>
              {[
                {
                  name: "Solo",
                  desc: "10 quotes/month · 1 user · 100 catalog items",
                  price: "£59",
                  color: "#0d9488",
                  borderColor: "#99f6e4",
                },
                {
                  name: "Pro",
                  desc: "15 quotes/month · 2 users · Unlimited catalog",
                  price: "£99",
                  color: "#3b82f6",
                  borderColor: "#bfdbfe",
                  badge: "Popular",
                },
                {
                  name: "Team",
                  desc: "50 quotes/month · 5 users · Everything in Pro",
                  price: "£159",
                  color: "#059669",
                  borderColor: "#bbf7d0",
                },
              ].map(plan => (
                <div
                  key={plan.name}
                  className="flex items-center justify-between p-3 rounded-lg border-2 cursor-pointer transition-colors"
                  style={{ borderColor: plan.borderColor }}
                  onMouseEnter={e =>
                    (e.currentTarget.style.borderColor = plan.color)
                  }
                  onMouseLeave={e =>
                    (e.currentTarget.style.borderColor = plan.borderColor)
                  }
                  onClick={() => {
                    setShowUpgradeModal(false);
                    setLocation("/pricing");
                  }}
                >
                  <div>
                    <p className="font-semibold text-sm">
                      {plan.name}
                      {plan.badge && (
                        <span className="text-xs font-normal px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 ml-1">
                          {plan.badge}
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">{plan.desc}</p>
                  </div>
                  <p
                    className="font-bold text-sm"
                    style={{ color: plan.color }}
                  >
                    {plan.price}
                    <span className="text-xs font-normal text-muted-foreground">
                      /mo
                    </span>
                  </p>
                </div>
              ))}
            </div>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => setShowUpgradeModal(false)}
              className="w-full sm:w-auto"
            >
              Maybe later
            </Button>
            <Button
              onClick={() => {
                setShowUpgradeModal(false);
                setLocation("/pricing");
              }}
              className="w-full sm:w-auto"
              style={{
                background: "var(--brand-primary-gradient)",
                color: "#ffffff",
                border: "none",
              }}
            >
              View Plans & Upgrade
              <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
