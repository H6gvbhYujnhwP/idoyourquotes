/**
 * QuoteRouter.tsx
 *
 * Reads the quote's tradePreset and renders the correct workspace.
 * - tradePreset === 'electrical'  →  ElectricalWorkspace
 * - everything else               →  QuoteWorkspace (unchanged)
 *
 * QuoteWorkspace is NOT modified — it continues to read its own useParams
 * and call getFull internally. The getFull call here is cached by React Query
 * so the second call inside QuoteWorkspace costs nothing.
 */

import { useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { Loader2, AlertCircle } from "lucide-react";
import QuoteWorkspace from "./QuoteWorkspace";
import ElectricalWorkspace from "./ElectricalWorkspace";

export default function QuoteRouter() {
  const params = useParams<{ id: string }>();
  const quoteId = parseInt(params.id || "0");

  const { data: fullQuote, isLoading, error } = trpc.quotes.getFull.useQuery(
    { id: quoteId },
    { enabled: quoteId > 0, retry: 1 }
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Loading quote…
      </div>
    );
  }

  if (error || !fullQuote) {
    return (
      <div className="flex items-center justify-center h-64 text-destructive gap-2">
        <AlertCircle className="h-5 w-5" />
        Quote not found or could not be loaded.
      </div>
    );
  }

  const tradePreset = fullQuote.quote.tradePreset;

  if (tradePreset === "electrical") {
    return <ElectricalWorkspace quoteId={quoteId} />;
  }

  // All other sectors — delegate to the unmodified QuoteWorkspace
  return <QuoteWorkspace />;
}
