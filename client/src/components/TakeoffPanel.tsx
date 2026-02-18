import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Zap, CheckCircle, AlertTriangle, Download } from "lucide-react";
import TakeoffChat from "./TakeoffChat";

// Simplified takeoff panel — shows counts, Q&A chat, and verified status.
// The full drawing viewer with SVG overlay (TakeoffViewer.tsx) can be added
// as a dialog/modal when the user clicks "View Marked Drawing".

interface TakeoffPanelProps {
  inputId: number;
  quoteId: number;
  filename: string;
  fileUrl?: string;
}

export default function TakeoffPanel({ inputId, quoteId, filename, fileUrl }: TakeoffPanelProps) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Fetch existing takeoff for this input
  const { data: takeoffData, refetch } = trpc.electricalTakeoff.getByInputId.useQuery(
    { inputId },
    { enabled: !!inputId }
  );

  // Mutations
  const analyzeMutation = trpc.electricalTakeoff.analyze.useMutation({
    onSuccess: () => {
      refetch();
      setIsAnalyzing(false);
    },
    onError: () => setIsAnalyzing(false),
  });

  const answerMutation = trpc.electricalTakeoff.answerQuestions.useMutation({
    onSuccess: () => refetch(),
  });

  const verifyMutation = trpc.electricalTakeoff.verify.useMutation({
    onSuccess: () => refetch(),
  });

  const handleRunTakeoff = () => {
    setIsAnalyzing(true);
    analyzeMutation.mutate({ inputId, quoteId });
  };

  const handleAnswersSubmitted = (answers: Record<string, string>) => {
    if (!takeoffData?.id) return;
    answerMutation.mutate({ takeoffId: takeoffData.id, answers });
  };

  const handleVerify = () => {
    if (!takeoffData?.id) return;
    verifyMutation.mutate({ takeoffId: takeoffData.id });
  };

  // No takeoff exists yet — show "Run Takeoff" button
  if (!takeoffData) {
    return (
      <div className="mt-2 p-3 bg-blue-50 rounded-lg border border-blue-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-blue-600" />
            <span className="text-sm font-medium text-blue-900">
              Electrical Drawing Detected
            </span>
          </div>
          <Button
            size="sm"
            className="bg-blue-600 hover:bg-blue-700"
            onClick={handleRunTakeoff}
            disabled={isAnalyzing || analyzeMutation.isPending}
          >
            {(isAnalyzing || analyzeMutation.isPending) ? (
              <>
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                Extracting symbols...
              </>
            ) : (
              <>
                <Zap className="h-3 w-3 mr-1" />
                Run Symbol Takeoff
              </>
            )}
          </Button>
        </div>
        <p className="text-xs text-blue-700 mt-1">
          AI will extract and count every electrical symbol from this drawing.
        </p>
      </div>
    );
  }

  // Takeoff exists — show results
  const takeoff = takeoffData;
  const isVerified = takeoff.status === 'verified';
  const counts = (takeoff.counts || {}) as Record<string, number>;
  const questions = (takeoff.questions || []) as Array<{
    id: string;
    question: string;
    context: string;
    options: Array<{ label: string; value: string }>;
    defaultValue?: string;
    symbolsAffected: number;
  }>;
  const symbolDescriptions = (takeoff.symbolDescriptions || {}) as Record<string, string>;
  const symbolStyles = (takeoff.symbolStyles || {}) as Record<string, { colour: string; shape: string; radius: number }>;
  const totalItems = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <div className="mt-2 space-y-2">
      {/* Counts summary */}
      <div className={`p-3 rounded-lg border ${
        isVerified ? 'bg-green-50 border-green-200' : 'bg-blue-50 border-blue-200'
      }`}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            {isVerified ? (
              <CheckCircle className="h-4 w-4 text-green-600" />
            ) : (
              <Zap className="h-4 w-4 text-blue-600" />
            )}
            <span className={`text-sm font-medium ${isVerified ? 'text-green-900' : 'text-blue-900'}`}>
              {isVerified ? 'Takeoff Verified' : 'Takeoff Ready — Verify Counts'}
            </span>
            <Badge variant="outline" className="text-xs">
              {totalItems} items
            </Badge>
          </div>
          {takeoff.hasTextLayer === false && (
            <Badge variant="destructive" className="text-xs">
              <AlertTriangle className="h-3 w-3 mr-1" />
              No text layer
            </Badge>
          )}
        </div>

        {/* Symbol count chips */}
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)).map(([code, count]) => {
            const style = symbolStyles[code];
            return (
              <div 
                key={code}
                className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-white border"
                style={{ 
                  borderColor: style?.colour ? `${style.colour}60` : '#ddd',
                  color: style?.colour || '#666',
                }}
              >
                <span 
                  className="w-2 h-2 rounded-full" 
                  style={{ backgroundColor: style?.colour || '#888' }}
                />
                {code}: {count}
              </div>
            );
          })}
        </div>
      </div>

      {/* Q&A Chat (only if there are questions and not yet verified) */}
      {questions.length > 0 && !isVerified && (
        <TakeoffChat
          questions={questions}
          counts={counts}
          drawingRef={takeoff.drawingRef || filename}
          symbolDescriptions={symbolDescriptions}
          onAnswersSubmitted={handleAnswersSubmitted}
          onVerify={handleVerify}
          isSubmitting={answerMutation.isPending || verifyMutation.isPending}
          isVerified={isVerified}
        />
      )}

      {/* Verify button (when no questions or all answered) */}
      {questions.length === 0 && !isVerified && (
        <Button 
          className="w-full bg-green-600 hover:bg-green-700"
          onClick={handleVerify}
          disabled={verifyMutation.isPending}
        >
          {verifyMutation.isPending ? (
            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
          ) : (
            <CheckCircle className="h-4 w-4 mr-1" />
          )}
          Verify Counts
        </Button>
      )}
    </div>
  );
}
