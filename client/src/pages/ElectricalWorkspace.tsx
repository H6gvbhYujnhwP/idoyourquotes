/**
 * ElectricalWorkspace.tsx
 * Phase 1 — routing shell only. No functionality.
 *
 * Layout contract:
 *   - Outer wrapper is h-full flex flex-col overflow-hidden
 *     → fills the flex-1 main area from DashboardLayout without page scroll
 *   - Header bar: fixed height (h-14)
 *   - Tab bar: fixed height (h-10)
 *   - Content area: flex-1 overflow-hidden
 *     → left sidebar and right panel each scroll independently
 *
 * Tabs: Inputs | Takeoff | QDS | Quote | PDF
 */

import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, ArrowLeft, Zap, Upload, Grid, Calculator, FileText, File } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

type Tab = "inputs" | "takeoff" | "qds" | "quote" | "pdf";

interface TabDefinition {
  id: Tab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const TABS: TabDefinition[] = [
  { id: "inputs",  label: "Inputs",  icon: Upload      },
  { id: "takeoff", label: "Takeoff", icon: Grid        },
  { id: "qds",     label: "QDS",     icon: Calculator  },
  { id: "quote",   label: "Quote",   icon: FileText    },
  { id: "pdf",     label: "PDF",     icon: File        },
];

// ─── Props ───────────────────────────────────────────────────────────────────

interface ElectricalWorkspaceProps {
  quoteId: number;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ElectricalWorkspace({ quoteId }: ElectricalWorkspaceProps) {
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState<Tab>("inputs");

  const { data: fullQuote, isLoading, error } = trpc.quotes.getFull.useQuery(
    { id: quoteId },
    { enabled: quoteId > 0, retry: 1 }
  );

  // ── Loading / error states ─────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Loading electrical workspace…
      </div>
    );
  }

  if (error || !fullQuote) {
    return (
      <div className="flex items-center justify-center h-64 text-destructive">
        Quote not found or could not be loaded.
      </div>
    );
  }

  const quote = fullQuote.quote;
  const title = quote.title || "Untitled Quote";
  const reference = quote.reference || "";

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    /*
     * Outer shell: fills flex-1 area from DashboardLayout.
     * overflow-hidden prevents the outer page from ever scrolling.
     */
    <div className="h-full flex flex-col overflow-hidden">

      {/* ── Header bar ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 border-b bg-background shrink-0 h-14">
        <div className="flex items-center gap-3 min-w-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setLocation("/dashboard")}
            className="shrink-0 -ml-1"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>

          <div className="flex items-center gap-2 min-w-0">
            <Zap className="h-4 w-4 text-yellow-500 shrink-0" />
            <span className="font-semibold truncate">{title}</span>
            {reference && (
              <span className="text-xs text-muted-foreground shrink-0">{reference}</span>
            )}
            <Badge
              variant="secondary"
              className="text-xs shrink-0 capitalize bg-yellow-100 text-yellow-800 border-yellow-200"
            >
              Electrical
            </Badge>
          </div>
        </div>

        {/* Phase 1 placeholder — save / actions added in later phases */}
        <div className="shrink-0 text-xs text-muted-foreground italic">
          Electrical Workspace
        </div>
      </div>

      {/* ── Tab bar ────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1 px-4 border-b bg-background shrink-0 h-10">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1 rounded-md text-sm font-medium transition-colors h-7",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ── Main content area ──────────────────────────────────────────────── */}
      {/*
       * flex-1 + overflow-hidden: this row fills everything below the header
       * and tab bar. Children define their own scroll contexts.
       */}
      <div className="flex flex-1 overflow-hidden">

        {/* Left sidebar — drawing list (Phase 2+) */}
        <div className="w-56 shrink-0 border-r flex flex-col overflow-hidden bg-muted/30">
          <div className="px-3 py-2 border-b bg-background">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Drawings
            </span>
          </div>
          {/* Sidebar list scrolls independently */}
          <div className="flex-1 overflow-y-auto">
            <div className="flex items-center justify-center h-32 text-xs text-muted-foreground italic px-3 text-center">
              Upload drawings on the Inputs tab to begin
            </div>
          </div>
        </div>

        {/* Right content — tab panels */}
        {/* overflow-y-auto: only this panel scrolls */}
        <div className="flex-1 overflow-y-auto">
          <TabContent tab={activeTab} quoteId={quoteId} />
        </div>

      </div>
    </div>
  );
}

// ─── Tab content placeholder ─────────────────────────────────────────────────

function TabContent({ tab, quoteId }: { tab: Tab; quoteId: number }) {
  const labels: Record<Tab, { heading: string; body: string }> = {
    inputs:  { heading: "Inputs",  body: "Upload drawings, a symbol legend, and paste any scope notes here. (Phase 2)" },
    takeoff: { heading: "Takeoff", body: "Symbol review table — counts, descriptions, toggles per drawing. (Phase 3)" },
    qds:     { heading: "QDS",     body: "Quantities, Spon's labour auto-calculation, plant hire, preliminaries. (Phase 4)" },
    quote:   { heading: "Quote",   body: "Line items, phases, timelines, totals. (Phase 5)" },
    pdf:     { heading: "PDF",     body: "Tender submission document — cover page, breakdown, terms. (Phase 6)" },
  };

  const { heading, body } = labels[tab];

  return (
    <div className="flex flex-col items-center justify-center min-h-64 gap-3 p-8 text-center">
      <p className="text-lg font-semibold text-foreground">{heading}</p>
      <p className="text-sm text-muted-foreground max-w-sm">{body}</p>
      <p className="text-xs text-muted-foreground/60">Quote ID: {quoteId}</p>
    </div>
  );
}
