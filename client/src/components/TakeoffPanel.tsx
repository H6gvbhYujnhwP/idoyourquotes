import { useState, useRef, useEffect, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import {
  Loader2, Zap, CheckCircle, AlertTriangle, X,
  ZoomIn, ZoomOut, Maximize, Eye, EyeOff,
  Bot, MessageCircle, Send, Image, ChevronDown, ChevronUp, Lock,
  Plus, Save, MousePointer2,
} from "lucide-react";
import { brand } from "@/lib/brandTheme";

interface TakeoffPanelProps {
  inputId: number;
  quoteId: number;
  filename: string;
  fileUrl?: string;
  processingInstructions?: string;
  reanalyzeTrigger?: number;
}

export default function TakeoffPanel({ inputId, quoteId, filename, fileUrl, processingInstructions, reanalyzeTrigger }: TakeoffPanelProps) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showViewer, setShowViewer] = useState(false);
  const [showChat, setShowChat] = useState(true);

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

  const unlockMutation = trpc.electricalTakeoff.unlock.useMutation({
    onSuccess: () => refetch(),
  });

  const handleRunTakeoff = () => {
    setIsAnalyzing(true);
    analyzeMutation.mutate({ inputId, quoteId });
  };

  // Re-run takeoff when parent triggers re-analysis (skip if locked/verified)
  const [lastTrigger, setLastTrigger] = useState(0);
  const [userExcludedCodes, setUserExcludedCodes] = useState<Set<string>>(new Set());

  // Load persisted excluded codes from takeoff userAnswers
  useEffect(() => {
    if (takeoffData?.userAnswers) {
      const answers = takeoffData.userAnswers as Record<string, string>;
      if (answers._excludedCodes) {
        try {
          const codes = JSON.parse(answers._excludedCodes) as string[];
          setUserExcludedCodes(new Set(codes));
        } catch {}
      }
    }
  }, [takeoffData?.userAnswers]);

  // Mutation to persist excluded codes to backend
  const saveExcludedMutation = trpc.electricalTakeoff.updateExcludedCodes.useMutation();

  useEffect(() => {
    if (reanalyzeTrigger && reanalyzeTrigger > lastTrigger && takeoffData && takeoffData.status !== 'verified') {
      setLastTrigger(reanalyzeTrigger);
      setIsAnalyzing(true);
      analyzeMutation.mutate({ inputId, quoteId });
    }
  }, [reanalyzeTrigger]);

  const handleAnswersSubmitted = (answers: Record<string, string>) => {
    if (!takeoffData?.id) return;
    answerMutation.mutate({ takeoffId: takeoffData.id, answers });
  };

  const handleVerify = () => {
    if (!takeoffData?.id) return;
    verifyMutation.mutate({ takeoffId: takeoffData.id });
  };

  // Parse processing instructions to auto-exclude symbol categories
  // Must be before any conditional returns to maintain React hook ordering
  const rawCounts = (takeoffData?.counts || {}) as Record<string, number>;
  const rawSymbolDescriptions = (takeoffData?.symbolDescriptions || {}) as Record<string, string>;

  const excludedCodes = useMemo(() => {
    if (!processingInstructions || !takeoffData) return new Set<string>();
    // Don't apply instruction filtering to locked/verified takeoffs
    if (takeoffData.status === 'verified') return new Set<string>();
    const lower = processingInstructions.toLowerCase().trim();
    const excluded = new Set<string>();

    // Build a lookup: code -> description, and description words -> code
    const codeList = Object.keys(rawCounts);
    const descToCode: Record<string, string[]> = {};
    for (const code of codeList) {
      const desc = (rawSymbolDescriptions[code] || '').toLowerCase();
      // Map whole description and individual meaningful words to this code
      if (desc) {
        if (!descToCode[desc]) descToCode[desc] = [];
        descToCode[desc].push(code);
        // Also map key words (e.g. "smoke" from "Optical Smoke Detector")
        const words = desc.split(/\s+/).filter(w => w.length > 3);
        for (const word of words) {
          if (!descToCode[word]) descToCode[word] = [];
          if (!descToCode[word].includes(code)) descToCode[word].push(code);
        }
      }
    }

    // Helper: check if a term matches a symbol code or description
    const findMatchingCodes = (term: string): string[] => {
      const t = term.trim().toLowerCase();
      if (!t) return [];
      const matches: string[] = [];

      for (const code of codeList) {
        // Direct code match (case insensitive)
        if (code.toLowerCase() === t) {
          matches.push(code);
          continue;
        }
        // Description contains the term
        const desc = (rawSymbolDescriptions[code] || '').toLowerCase();
        if (desc && (desc.includes(t) || t.includes(desc))) {
          matches.push(code);
        }
      }

      // Also check common aliases
      const aliases: Record<string, string[]> = {
        'exit signs': ['EXIT1', 'EX'],
        'exit sign': ['EXIT1', 'EX'],
        'exits': ['EXIT1', 'EX'],
        'smoke detectors': ['SO'],
        'smoke detector': ['SO'],
        'smoke': ['SO'],
        'fire alarm': ['SO', 'CO', 'HF', 'HC', 'HR', 'CO2', 'SB', 'FARP', 'VESDA'],
        'fire': ['SO', 'CO', 'HF', 'HC', 'HR', 'CO2', 'SB', 'FARP', 'VESDA'],
        'pir': ['P4', 'P1', 'P2', 'P3'],
        'pirs': ['P4', 'P1', 'P2', 'P3'],
        'sensors': ['P4', 'P1', 'P2', 'P3'],
        'emergency': ['JE', 'EXIT1', 'EX'],
        'emergency lights': ['JE'],
        'emergency lighting': ['JE'],
        'downlights': ['J'],
        'led lights': ['J', 'JE', 'N'],
        'surface lights': ['N'],
        'controls': ['P4', 'P1', 'P2', 'P3', 'LCM'],
        'cctv': ['CCTV'],
        'access control': ['AC'],
        'power': ['PWR', 'DB'],
      };

      if (aliases[t]) {
        for (const code of aliases[t]) {
          if (rawCounts[code] && !matches.includes(code)) {
            matches.push(code);
          }
        }
      }

      return matches;
    };

    // === CATEGORY-LEVEL PATTERNS ===

    // "lighting only" / "lights only" → exclude everything that isn't lighting
    const isLightingOnly = lower.includes('lighting only') || lower.includes('lights only');
    if (isLightingOnly) {
      for (const code of codeList) {
        const desc = (rawSymbolDescriptions[code] || '').toLowerCase();
        const isLighting = desc.includes('light') || desc.includes('led') || desc.includes('emergency') ||
          desc.includes('exit') || desc.includes('luminaire') || desc.includes('downlight') ||
          desc.includes('batten') || code === 'J' || code === 'JE' || code === 'N' ||
          code === 'EXIT1' || code === 'EX';
        const isControl = desc.includes('pir') || desc.includes('presence') || desc.includes('control') ||
          code.startsWith('P') || code === 'LCM';
        if (!isLighting && !isControl) {
          excluded.add(code);
        }
      }
    }

    // === ITEM-LEVEL PATTERNS ===
    // Match: "remove X", "exclude X", "no X", "without X", "drop X", "delete X", "ignore X"
    const excludePatterns = [
      /(?:remove|exclude|excluding|no|without|drop|delete|ignore|take out|take off|minus|less|not|don'?t (?:include|count|want))\s+(.+)/gi,
    ];

    for (const pattern of excludePatterns) {
      let match;
      // Reset lastIndex for global regex
      pattern.lastIndex = 0;
      while ((match = pattern.exec(lower)) !== null) {
        const remainder = match[1].trim();
        // Split on commas, "and", "&" to handle "remove X, Y and Z"
        const terms = remainder.split(/[,&]|\band\b/).map(s => s.trim()).filter(Boolean);
        for (const term of terms) {
          // Clean trailing punctuation
          const cleaned = term.replace(/[.\s]+$/, '');
          const codes = findMatchingCodes(cleaned);
          for (const code of codes) {
            excluded.add(code);
          }
        }
      }
    }

    return excluded;
  }, [processingInstructions, rawCounts, rawSymbolDescriptions, takeoffData]);

  // Combined exclusions: instruction-based + user-toggled
  const allExcludedCodes = useMemo(() => {
    const combined = new Set(excludedCodes);
    for (const code of userExcludedCodes) {
      combined.add(code);
    }
    return combined;
  }, [excludedCodes, userExcludedCodes]);

  const filteredCounts = useMemo(() => {
    const filtered: Record<string, number> = {};
    for (const [code, count] of Object.entries(rawCounts)) {
      if (!allExcludedCodes.has(code)) {
        filtered[code] = count;
      }
    }
    return filtered;
  }, [rawCounts, allExcludedCodes]);

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
  const counts = rawCounts;
  const symbolDescriptions = rawSymbolDescriptions;
  const questions = (takeoff.questions || []) as Array<{
    id: string;
    question: string;
    context: string;
    options: Array<{ label: string; value: string }>;
    defaultValue?: string;
    symbolsAffected: number;
  }>;
  const symbolStyles = (takeoff.symbolStyles || {}) as Record<string, { colour: string; shape: string; radius: number }>;
  const svgOverlay = (takeoff.svgOverlay || '') as string;

  const totalItems = Object.values(rawCounts).reduce((a, b) => a + b, 0);
  const filteredTotal = Object.values(filteredCounts).reduce((a, b) => a + b, 0);
  const hasFilter = allExcludedCodes.size > 0;

  const toggleChipExclusion = (code: string) => {
    if (isVerified) return;
    if (excludedCodes.has(code)) return;
    setUserExcludedCodes(prev => {
      const next = new Set(prev);
      if (next.has(code)) {
        next.delete(code);
      } else {
        next.add(code);
      }
      // Persist to backend
      if (takeoff?.id) {
        saveExcludedMutation.mutate({ takeoffId: takeoff.id, excludedCodes: Array.from(next) });
      }
      return next;
    });
  };

  return (
    <div>
      {/* Takeoff status strip — matches parent navy gradient for seamless look */}
      <div className="flex items-center justify-between px-4 py-2.5" style={{ background: `linear-gradient(135deg, ${brand.navy} 0%, #1e3a5f 100%)` }}>
          <div className="flex items-center gap-2">
            {isVerified ? (
              <CheckCircle className="h-4 w-4 text-green-400" />
            ) : (
              <Zap className="h-4 w-4 text-teal-400" />
            )}
            <span className="text-sm font-extrabold text-white">
              {isVerified ? 'Approved' : 'Takeoff Ready'}
            </span>
            {isVerified && (
              <button
                className="text-[11px] font-bold px-2 py-1 rounded-lg text-amber-300 bg-white/10 border border-white/20 hover:bg-white/20 transition-colors"
                onClick={() => { if (takeoff?.id) unlockMutation.mutate({ takeoffId: takeoff.id }); }}
                disabled={unlockMutation.isPending}
              >
                {unlockMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <><Lock className="h-3 w-3 mr-1 inline" />Edit</>}
              </button>
            )}
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-teal-500/20 text-teal-300">
              {hasFilter ? `${filteredTotal} in scope` : `${totalItems} items`}
            </span>
            {hasFilter && (
              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-white/10 text-white/50">
                {totalItems - filteredTotal} excluded
              </span>
            )}
            {takeoff.hasTextLayer === false && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500/20 text-red-300">No text layer</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {svgOverlay && (
              <button
                className="text-[11px] font-bold px-3 py-1.5 rounded-lg bg-white/15 text-white hover:bg-white/25 border border-white/20 transition-colors"
                onClick={() => setShowViewer(true)}
              >
                <Image className="h-3 w-3 mr-1 inline" />
                View Marked Drawing
              </button>
            )}
          </div>
        </div>

        {/* Clickable chips with descriptions */}
        <div className="px-4 py-3 flex flex-wrap gap-2">
          {Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)).map(([code, count]) => {
            const style = symbolStyles[code];
            const colour = style?.colour || '#888888';
            const isInstructionExcluded = excludedCodes.has(code);
            const isUserExcluded = userExcludedCodes.has(code);
            const isExcluded = allExcludedCodes.has(code);
            const isClickable = !isVerified && !isInstructionExcluded;
            return (
              <button
                key={code}
                onClick={() => toggleChipExclusion(code)}
                disabled={!isClickable}
                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border transition-all ${
                  isExcluded ? 'opacity-40' : 'hover:shadow-md'
                } ${isClickable ? 'cursor-pointer' : isInstructionExcluded ? 'cursor-not-allowed' : 'cursor-default'}`}
                style={{
                  borderColor: isExcluded ? '#e5e7eb' : `${colour}30`,
                  backgroundColor: isExcluded ? '#f9fafb' : `${colour}06`,
                }}
                title={
                  isInstructionExcluded ? `${code} excluded by processing instructions`
                  : isUserExcluded ? `${code} excluded — click to include`
                  : isVerified ? `${code}: ${symbolDescriptions[code] || code}`
                  : `Click to exclude ${code} from quote`
                }
              >
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: isExcluded ? '#d1d5db' : colour }} />
                <span className={`text-xs font-extrabold ${isExcluded ? 'line-through' : ''}`} style={{ color: isExcluded ? '#9ca3af' : colour }}>
                  {count}
                </span>
                <span className={`text-[10px] font-bold ${isExcluded ? '' : ''}`} style={{ color: isExcluded ? '#9ca3af' : brand.navyMuted }}>
                  {code}
                </span>
                <span className="text-[10px]" style={{ color: isExcluded ? '#d1d5db' : '#cbd5e1' }}>—</span>
                <span className={`text-[10px] font-medium ${isExcluded ? 'line-through' : ''}`} style={{ color: isExcluded ? '#9ca3af' : brand.navyMuted }}>
                  {symbolDescriptions[code] || code}
                </span>
                {isInstructionExcluded && <span className="text-[8px] text-gray-400 ml-0.5">instructions</span>}
                {isUserExcluded && <span className="text-[8px] ml-0.5" style={{ color: brand.teal }}>click to restore</span>}
              </button>
            );
          })}
        </div>

      {/* Expandable Chat / Q&A Section */}
      <div className="border-t overflow-hidden" style={{ borderColor: brand.border }}>
        <button
          className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 hover:bg-gray-100 transition-colors"
          onClick={() => setShowChat(!showChat)}
        >
          <div className="flex items-center gap-2">
            <Bot className="h-4 w-4 text-blue-500" />
            <span className="text-sm font-medium">AI Takeoff Assistant</span>
            {questions.length > 0 && !isVerified && (
              <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-300">
                {questions.length} question{questions.length > 1 ? 's' : ''}
              </Badge>
            )}
          </div>
          {showChat ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>

        {showChat && (
          <TakeoffChatSection
            questions={questions}
            counts={counts}
            drawingRef={takeoff.drawingRef || filename}
            symbolDescriptions={symbolDescriptions}
            onAnswersSubmitted={handleAnswersSubmitted}
            onVerify={handleVerify}
            onExcludeCodes={(codes) => {
              setUserExcludedCodes(prev => {
                const next = new Set(prev);
                codes.forEach(c => next.add(c));
                // Persist to backend
                if (takeoff?.id) {
                  saveExcludedMutation.mutate({ takeoffId: takeoff.id, excludedCodes: Array.from(next) });
                }
                return next;
              });
            }}
            isSubmitting={answerMutation.isPending || verifyMutation.isPending}
            isVerified={isVerified}
          />
        )}
      </div>

      {/* Verify button (when no questions and not in chat mode) */}
      {questions.length === 0 && !isVerified && !showChat && (
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
          Approve for Quote
        </Button>
      )}

      {/* Full-screen Drawing Viewer Modal */}
      {showViewer && svgOverlay && (
        <DrawingViewerModal
          inputId={inputId}
          takeoffId={takeoff.id}
          svgOverlay={svgOverlay}
          symbols={(takeoff.symbols || []) as Array<{id: string; symbolCode: string; category: string; x: number; y: number; confidence: string; isStatusMarker: boolean}>}
          pageWidth={parseFloat(takeoff.pageWidth as string) || 2384}
          pageHeight={parseFloat(takeoff.pageHeight as string) || 1684}
          counts={counts}
          symbolStyles={symbolStyles}
          symbolDescriptions={symbolDescriptions}
          drawingRef={takeoff.drawingRef || filename}
          isVerified={isVerified}
          initialHiddenCodes={allExcludedCodes}
          onClose={() => setShowViewer(false)}
          onSave={() => { refetch(); setShowViewer(false); }}
        />
      )}
    </div>
  );
}


// ============ INLINE CHAT SECTION ============

interface TakeoffChatSectionProps {
  questions: Array<{
    id: string;
    question: string;
    context: string;
    options: Array<{ label: string; value: string }>;
    defaultValue?: string;
    symbolsAffected: number;
  }>;
  counts: Record<string, number>;
  drawingRef: string;
  symbolDescriptions: Record<string, string>;
  onAnswersSubmitted: (answers: Record<string, string>) => void;
  onVerify: () => void;
  onExcludeCodes?: (codes: string[]) => void;
  isSubmitting?: boolean;
  isVerified?: boolean;
}

function TakeoffChatSection({
  questions,
  counts,
  drawingRef,
  symbolDescriptions,
  onAnswersSubmitted,
  onVerify,
  onExcludeCodes,
  isSubmitting = false,
  isVerified = false,
}: TakeoffChatSectionProps) {
  const [answers, setAnswers] = useState<Record<string, string>>(() => {
    const defaults: Record<string, string> = {};
    for (const q of questions) {
      if (q.defaultValue) defaults[q.id] = q.defaultValue;
    }
    return defaults;
  });
  const [answeredIds, setAnsweredIds] = useState<Set<string>>(new Set());
  const [userMessage, setUserMessage] = useState('');
  const [chatMessages, setChatMessages] = useState<Array<{
    role: 'user' | 'assistant';
    text: string;
  }>>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [chatMessages, answeredIds]);

  const handleAnswer = (questionId: string, value: string) => {
    setAnswers(prev => ({ ...prev, [questionId]: value }));
  };

  const handleConfirmQuestion = (questionId: string) => {
    setAnsweredIds(prev => new Set([...prev, questionId]));
    // Submit answers immediately so counts update right away
    onAnswersSubmitted({ ...answers });
  };

  const allAnswered = questions.every(q => answeredIds.has(q.id));

  const handleSubmitAll = () => {
    onAnswersSubmitted(answers);
    setAnsweredIds(new Set(questions.map(q => q.id)));
  };

  const handleSendMessage = () => {
    if (!userMessage.trim()) return;
    const msg = userMessage.trim();
    setUserMessage('');

    setChatMessages(prev => [...prev, { role: 'user', text: msg }]);

    // Generate a contextual response based on the message
    const lowerMsg = msg.toLowerCase();
    let response = '';

    if (lowerMsg.includes('lighting only') || lowerMsg.includes('ignore fire') || lowerMsg.includes('exclude fire')) {
      const lightingCodes = Object.entries(counts)
        .filter(([code]) => {
          const desc = (symbolDescriptions[code] || '').toLowerCase();
          return desc.includes('light') || desc.includes('led') || desc.includes('emergency') ||
                 desc.includes('exit') || code === 'J' || code === 'JE' || code === 'N' ||
                 code === 'EXIT1' || code === 'EX';
        });
      const nonLightingCodes = Object.keys(counts).filter(code => !lightingCodes.some(([c]) => c === code));
      const lightingTotal = lightingCodes.reduce((sum, [, c]) => sum + c, 0);
      // Actually exclude non-lighting codes
      if (onExcludeCodes && nonLightingCodes.length > 0) {
        onExcludeCodes(nonLightingCodes);
      }
      response = `Done — excluded ${nonLightingCodes.join(', ')} from scope. Your lighting items:\n\n${lightingCodes.map(([code, count]) => `• ${code} (${symbolDescriptions[code] || code}): ${count}`).join('\n')}\n\nLighting total: ${lightingTotal} items. The excluded symbols are now greyed out above.`;
    } else if (
      // Broad match: user wants N status markers counted as fittings
      // Matches: "add all N", "include N", "count N as", "make N a surface", "N are surface LED", etc.
      (lowerMsg.match(/\bn\b/) || lowerMsg.includes("'n'") || lowerMsg.includes('"n"')) &&
      (lowerMsg.includes('add') || lowerMsg.includes('include') || lowerMsg.includes('count') ||
       lowerMsg.includes('make') || lowerMsg.includes('are') || lowerMsg.includes('should be') ||
       lowerMsg.includes('surface') || lowerMsg.includes('led') || lowerMsg.includes('fitting') ||
       lowerMsg.includes('175') || lowerMsg.includes('status'))
    ) {
      // User wants to include the N status markers as actual fittings — trigger the backend answer
      onAnswersSubmitted({ 'n-status-marker': 'include' });
      response = `Done — I've included all N labels as Surface LED Light fittings. The counts are being recalculated now and the N chip above will update to show the full count.`;
    } else if (lowerMsg.includes('how many') || lowerMsg.includes('count') || lowerMsg.includes('total')) {
      const totalItems = Object.values(counts).reduce((a, b) => a + b, 0);
      response = `Current counts from ${drawingRef}:\n\n${Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)).map(([code, count]) => `• ${code} (${symbolDescriptions[code] || code}): ${count}`).join('\n')}\n\nTotal: ${totalItems} items detected.`;
    } else if (lowerMsg.includes('what') && (lowerMsg.includes('je') || lowerMsg.includes('j e'))) {
      response = `JE symbols are Linear LED Emergency fittings — LED light fixtures with built-in emergency battery backup. On this drawing I found ${counts['JE'] || 0} of them. They're shown with orange circle markers on the marked-up drawing.`;
    } else if (lowerMsg.includes('legend') || lowerMsg.includes('key')) {
      response = `This appears to be a ${drawingRef.toLowerCase().includes('legend') ? 'legend/key sheet' : 'drawing sheet'}. Legend sheets show one of each symbol for reference — the counts from a legend won't reflect actual installation quantities. If this is a legend sheet, the counts here are just the reference symbols (1 of each type), not the actual quantities needed for the job.`;
    } else if (lowerMsg.includes('re-run') || lowerMsg.includes('rerun') || lowerMsg.includes('run again')) {
      response = `I can't re-run the extraction from here yet, but the counts shown are from the most recent analysis. If you believe symbols were missed, please note which ones and I'll flag them for manual review. You can adjust the final quantities during quote generation.`;
    } else if (lowerMsg.includes('scope') || lowerMsg.includes('tender') || lowerMsg.includes('spec')) {
      response = `To scope the takeoff correctly, paste the tender email or specification requirements into the "Instructions / Notes for AI" field at the top of the page. When you generate the quote, the AI will cross-reference those instructions with these takeoff counts to only price what's in scope.\n\nFor example, if the tender says "lighting only, exclude fire alarm", the quote AI will use the J, JE, N, EXIT1, and P4 counts but skip SO (smoke detectors) and other fire alarm items.`;
    } else if (lowerMsg.includes('exclude') || lowerMsg.includes('remove') || lowerMsg.includes('ignore')) {
      // Try to find which codes the user wants to exclude
      const codesToExclude: string[] = [];
      for (const code of Object.keys(counts)) {
        const desc = (symbolDescriptions[code] || '').toLowerCase();
        if (lowerMsg.includes(code.toLowerCase()) || (desc && lowerMsg.includes(desc.split(' ')[0].toLowerCase()))) {
          codesToExclude.push(code);
        }
      }
      // Also check description keywords
      for (const [code, desc] of Object.entries(symbolDescriptions)) {
        const words = desc.toLowerCase().split(/\s+/).filter(w => w.length > 3);
        if (words.some(w => lowerMsg.includes(w)) && !codesToExclude.includes(code)) {
          codesToExclude.push(code);
        }
      }
      if (codesToExclude.length > 0 && onExcludeCodes) {
        onExcludeCodes(codesToExclude);
        response = `Done — excluded ${codesToExclude.map(c => `${c} (${symbolDescriptions[c] || c})`).join(', ')} from scope. These are now greyed out above.`;
      } else {
        response = `I couldn't identify which symbols to exclude. Try specifying the code (e.g. "exclude SO") or the description (e.g. "exclude smoke detectors").`;
      }
    } else {
      response = `I've extracted ${Object.values(counts).reduce((a, b) => a + b, 0)} symbols from this drawing across ${Object.keys(counts).length} different types. Here's what I can help with:\n\n• Tell me to focus on specific categories (e.g. "lighting only", "exclude fire alarm")\n• Ask about specific symbol codes (e.g. "what is JE?")\n• Ask for a count summary\n• Ask about how scope filtering works with the tender instructions\n\nThe marked-up drawing view shows coloured markers at each detected symbol location.`;
    }

    setTimeout(() => {
      setChatMessages(prev => [...prev, { role: 'assistant', text: response }]);
    }, 300);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const totalItems = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <div className="flex flex-col">
      <div ref={scrollRef} className="max-h-96 overflow-y-auto p-3 space-y-3">

        {/* Questions */}
        {questions.map((q) => (
          <div key={q.id} className="flex gap-2">
            <div className="h-7 w-7 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0 mt-0.5">
              {answeredIds.has(q.id) ? (
                <CheckCircle className="h-4 w-4 text-green-600" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-amber-600" />
              )}
            </div>
            <div className={`flex-1 rounded-lg p-3 text-sm ${
              answeredIds.has(q.id) ? 'bg-green-50 border border-green-200' : 'bg-amber-50 border border-amber-200'
            }`}>
              <p className="font-medium text-gray-900 mb-1">{q.question}</p>
              {q.context && (
                <p className="text-xs text-gray-600 mb-3">{q.context}</p>
              )}
              {q.symbolsAffected > 0 && (
                <Badge variant="outline" className="mb-2 text-xs">
                  Affects {q.symbolsAffected} items
                </Badge>
              )}

              {!answeredIds.has(q.id) ? (
                <>
                  <RadioGroup
                    value={answers[q.id] || ''}
                    onValueChange={(val) => handleAnswer(q.id, val)}
                    className="mt-2 space-y-2"
                  >
                    {q.options.map(opt => (
                      <div key={opt.value} className="flex items-center space-x-2">
                        <RadioGroupItem value={opt.value} id={`${q.id}-${opt.value}`} />
                        <Label htmlFor={`${q.id}-${opt.value}`} className="text-sm cursor-pointer">
                          {opt.label}
                        </Label>
                      </div>
                    ))}
                  </RadioGroup>
                  <Button
                    size="sm"
                    className="mt-3"
                    disabled={!answers[q.id]}
                    onClick={() => handleConfirmQuestion(q.id)}
                  >
                    Confirm
                  </Button>
                </>
              ) : (
                <div className="flex items-center gap-1 mt-1 text-xs text-green-700">
                  <CheckCircle className="h-3 w-3" />
                  {q.options.find(o => o.value === answers[q.id])?.label || answers[q.id]}
                </div>
              )}
            </div>
          </div>
        ))}

        {/* User chat messages */}
        {chatMessages.map((msg, idx) => (
          <div key={idx} className="flex gap-2">
            {msg.role === 'user' ? (
              <>
                <div className="flex-1" />
                <div className="bg-gray-100 rounded-lg p-3 text-sm max-w-[80%]">
                  {msg.text}
                </div>
                <div className="h-7 w-7 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <MessageCircle className="h-4 w-4 text-gray-600" />
                </div>
              </>
            ) : (
              <>
                <div className="h-7 w-7 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Bot className="h-4 w-4 text-blue-600" />
                </div>
                <div className="flex-1 bg-blue-50 rounded-lg p-3 text-sm whitespace-pre-line">
                  {msg.text}
                </div>
              </>
            )}
          </div>
        ))}

        {/* Status messages */}
        {questions.length > 0 && allAnswered && !isVerified && chatMessages.length === 0 && (
          <div className="flex gap-2">
            <div className="h-7 w-7 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0 mt-0.5">
              <CheckCircle className="h-4 w-4 text-green-600" />
            </div>
            <div className="flex-1 bg-green-50 rounded-lg p-3 text-sm">
              <p className="font-medium text-green-900">
                All questions answered. Click "View Marked Drawing" to see where symbols were found, or type a message below to adjust the scope.
              </p>
            </div>
          </div>
        )}

        {isVerified && (
          <div className="flex gap-2">
            <div className="h-7 w-7 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0 mt-0.5">
              <CheckCircle className="h-4 w-4 text-green-600" />
            </div>
            <div className="flex-1 bg-green-100 rounded-lg p-3 text-sm border border-green-300">
              <p className="font-bold text-green-900">
                Counts verified and locked
              </p>
              <p className="text-xs text-green-700 mt-1">
                These quantities will be used in your quote generation.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Chat input + action buttons */}
      <div className="border-t p-3 space-y-2">
        {/* Prompt input */}
        {!isVerified && (
          <div className="flex gap-2">
            <Textarea
              value={userMessage}
              onChange={(e) => setUserMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about the takeoff, adjust scope, or request changes..."
              className="min-h-[40px] max-h-[80px] resize-none text-sm"
              rows={1}
            />
            <Button
              size="icon"
              className="h-10 w-10 flex-shrink-0"
              onClick={handleSendMessage}
              disabled={!userMessage.trim()}
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-2">
          {questions.length > 0 && !allAnswered && (
            <Button
              className="flex-1"
              onClick={handleSubmitAll}
              disabled={isSubmitting || questions.some(q => !answers[q.id])}
            >
              <MessageCircle className="h-4 w-4 mr-1" />
              Submit Answers
            </Button>
          )}
          {(allAnswered || questions.length === 0) && !isVerified && (
            <Button
              className="flex-1 bg-green-600 hover:bg-green-700"
              onClick={onVerify}
              disabled={isSubmitting}
            >
              <CheckCircle className="h-4 w-4 mr-1" />
              Approve for Quote
            </Button>
          )}
          {isVerified && (
            <Badge className="flex-1 justify-center py-2 bg-green-100 text-green-800 hover:bg-green-100">
              <CheckCircle className="h-4 w-4 mr-1" />
              Approved
            </Badge>
          )}
        </div>
      </div>
    </div>
  );
}


// ============ DRAWING VIEWER MODAL ============

interface MarkerData {
  id: string;
  symbolCode: string;
  x: number;
  y: number;
  isStatusMarker: boolean;
  isNew?: boolean; // added by user
}

interface DrawingViewerModalProps {
  inputId: number;
  takeoffId: number;
  svgOverlay: string;
  symbols: Array<{id: string; symbolCode: string; category: string; x: number; y: number; confidence: string; isStatusMarker: boolean}>;
  pageWidth: number;
  pageHeight: number;
  counts: Record<string, number>;
  symbolStyles: Record<string, { colour: string; shape: string; radius: number }>;
  symbolDescriptions: Record<string, string>;
  drawingRef: string;
  isVerified?: boolean;
  initialHiddenCodes?: Set<string>;
  onClose: () => void;
  onSave?: () => void;
}

function DrawingViewerModal({
  inputId,
  takeoffId,
  svgOverlay,
  symbols: initialSymbols,
  pageWidth: pdfPageWidth,
  pageHeight: pdfPageHeight,
  counts: initialCounts,
  symbolStyles,
  symbolDescriptions,
  drawingRef,
  isVerified = false,
  initialHiddenCodes,
  onClose,
  onSave,
}: DrawingViewerModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [zoom, setZoom] = useState(1);
  const [showOverlay, setShowOverlay] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [pdfDimensions, setPdfDimensions] = useState({ width: 0, height: 0 });
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [hiddenCodes, setHiddenCodes] = useState<Set<string>>(initialHiddenCodes || new Set());

  // Editing state
  const [markers, setMarkers] = useState<MarkerData[]>(() =>
    initialSymbols.filter(s => !s.isStatusMarker).map(s => ({
      id: s.id,
      symbolCode: s.symbolCode,
      x: s.x,
      y: s.y,
      isStatusMarker: s.isStatusMarker,
    }))
  );
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());
  const [addedMarkers, setAddedMarkers] = useState<MarkerData[]>([]);
  const [editMode, setEditMode] = useState<string | null>(null); // null = pan mode, string = symbol code to place
  const [isSaving, setIsSaving] = useState(false);

  const hasChanges = removedIds.size > 0 || addedMarkers.length > 0;

  // Live counts based on current markers
  const liveCounts = useMemo(() => {
    const c: Record<string, number> = {};
    // Original markers minus removed
    for (const m of markers) {
      if (!removedIds.has(m.id)) {
        c[m.symbolCode] = (c[m.symbolCode] || 0) + 1;
      }
    }
    // Plus added
    for (const m of addedMarkers) {
      c[m.symbolCode] = (c[m.symbolCode] || 0) + 1;
    }
    return c;
  }, [markers, removedIds, addedMarkers]);

  const containerRef = useRef<HTMLDivElement>(null);

  const updateMarkersMutation = trpc.electricalTakeoff.updateMarkers.useMutation({
    onSuccess: () => {
      setIsSaving(false);
      if (onSave) onSave();
    },
    onError: (err) => {
      setIsSaving(false);
      console.error('Save failed:', err);
    },
  });

  const handleSaveEdits = () => {
    setIsSaving(true);
    updateMarkersMutation.mutate({
      takeoffId,
      removedIds: Array.from(removedIds),
      addedMarkers: addedMarkers.map(m => ({
        symbolCode: m.symbolCode,
        x: m.x,
        y: m.y,
      })),
    });
  };

  // Zoom towards a specific point (in container coordinates)
  const zoomToPoint = (newZoom: number, clientX: number, clientY: number) => {
    const clampedZoom = Math.max(0.25, Math.min(5, newZoom));
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) {
      setZoom(clampedZoom);
      return;
    }
    const mouseX = clientX - rect.left;
    const mouseY = clientY - rect.top;
    const contentX = (mouseX - position.x) / zoom;
    const contentY = (mouseY - position.y) / zoom;
    const newX = mouseX - contentX * clampedZoom;
    const newY = mouseY - contentY * clampedZoom;
    setZoom(clampedZoom);
    setPosition({ x: newX, y: newY });
  };

  const handleZoomIn = () => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) zoomToPoint(zoom + 0.25, rect.left + rect.width / 2, rect.top + rect.height / 2);
    else setZoom(z => Math.min(z + 0.25, 5));
  };
  const handleZoomOut = () => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) zoomToPoint(zoom - 0.25, rect.left + rect.width / 2, rect.top + rect.height / 2);
    else setZoom(z => Math.max(z - 0.25, 0.25));
  };
  const handleFit = () => { setZoom(1); setPosition({ x: 0, y: 0 }); };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    if (editMode) return; // Don't pan when in edit mode
    setIsDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPosition({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handleMouseUp = () => setIsDragging(false);

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.15 : 0.15;
    zoomToPoint(zoom + delta, e.clientX, e.clientY);
  };

  // Handle click on the drawing area — add marker in edit mode
  const handleDrawingClick = (e: React.MouseEvent) => {
    if (!editMode || !pdfDimensions.width) return;
    if (isDragging) return;

    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    // Convert screen click to content coordinates
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const contentX = (mouseX - position.x) / zoom;
    const contentY = (mouseY - position.y) / zoom;

    // Convert from CSS pixel space to PDF coordinate space
    const pdfX = (contentX / pdfDimensions.width) * pdfPageWidth;
    const pdfY = (contentY / pdfDimensions.height) * pdfPageHeight;

    // Don't place markers outside the drawing
    if (pdfX < 0 || pdfX > pdfPageWidth || pdfY < 0 || pdfY > pdfPageHeight) return;

    const newMarker: MarkerData = {
      id: `added-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      symbolCode: editMode,
      x: pdfX,
      y: pdfY,
      isStatusMarker: false,
      isNew: true,
    };

    setAddedMarkers(prev => [...prev, newMarker]);
  };

  // Handle clicking an existing marker to remove it
  const handleMarkerClick = (markerId: string, isAdded: boolean) => {
    if (isVerified) return;

    if (isAdded) {
      // Remove from addedMarkers
      setAddedMarkers(prev => prev.filter(m => m.id !== markerId));
    } else {
      // Add to removedIds
      setRemovedIds(prev => {
        const next = new Set(prev);
        if (next.has(markerId)) {
          next.delete(markerId); // Undo removal
        } else {
          next.add(markerId);
        }
        return next;
      });
    }
  };

  // Fetch PDF data through server proxy
  const { data: pdfData } = trpc.electricalTakeoff.getPdfData.useQuery(
    { inputId },
    { enabled: !!inputId }
  );

  // Render PDF to canvas
  useEffect(() => {
    if (!pdfData?.base64 || !canvasRef.current) return;
    let cancelled = false;

    const renderPdf = async () => {
      try {
        setIsLoading(true);
        setRenderError(null);

        if (!(window as any).pdfjsLib) {
          await new Promise<void>((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
            script.onload = () => {
              const pdfjsLib = (window as any).pdfjsLib;
              if (pdfjsLib) {
                pdfjsLib.GlobalWorkerOptions.workerSrc =
                  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
                resolve();
              } else reject(new Error('pdfjsLib not found'));
            };
            script.onerror = () => reject(new Error('Failed to load PDF.js'));
            document.head.appendChild(script);
          });
        }

        const pdfjsLib = (window as any).pdfjsLib;
        if (!pdfjsLib) throw new Error('PDF.js not available');

        const binaryString = atob(pdfData.base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);

        if (cancelled) return;

        const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
        const page = await pdf.getPage(1);
        if (cancelled) return;

        const renderScale = 2;
        const viewport = page.getViewport({ scale: renderScale });
        const canvas = canvasRef.current;
        if (!canvas) return;

        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.width = `${viewport.width / renderScale}px`;
        canvas.style.height = `${viewport.height / renderScale}px`;

        setPdfDimensions({ width: viewport.width / renderScale, height: viewport.height / renderScale });

        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Cannot get canvas context');

        await page.render({ canvasContext: ctx, viewport }).promise;
        if (!cancelled) setIsLoading(false);
      } catch (err: any) {
        if (!cancelled) {
          console.error('[DrawingViewer] PDF render error:', err);
          setRenderError(err.message || 'Failed to render PDF');
          setIsLoading(false);
        }
      }
    };

    renderPdf();
    return () => { cancelled = true; };
  }, [pdfData]);

  const toggleCode = (code: string) => {
    setHiddenCodes(prev => {
      const next = new Set(prev);
      next.has(code) ? next.delete(code) : next.add(code);
      return next;
    });
  };

  const totalItems = Object.values(liveCounts).reduce((a, b) => a + b, 0);
  const visibleTotal = Object.entries(liveCounts)
    .filter(([code]) => !hiddenCodes.has(code))
    .reduce((sum, [, count]) => sum + count, 0);

  // Render a single marker as SVG
  const renderMarker = (m: MarkerData, isRemoved: boolean, isAdded: boolean) => {
    if (isRemoved || hiddenCodes.has(m.symbolCode)) return null;
    if (!showOverlay) return null;

    const style = symbolStyles[m.symbolCode] || { colour: '#888888', shape: 'circle', radius: 20 };
    const r = style.radius / 4;
    const cx = (m.x / pdfPageWidth) * pdfDimensions.width;
    const cy = (m.y / pdfPageHeight) * pdfDimensions.height;

    return (
      <g
        key={m.id}
        style={{ cursor: isVerified ? 'default' : 'pointer' }}
        onClick={(e) => {
          e.stopPropagation();
          handleMarkerClick(m.id, isAdded);
        }}
      >
        {style.shape === 'circle' && (
          <>
            <circle cx={cx} cy={cy} r={r} fill="none" stroke={style.colour} strokeWidth={1.5} strokeOpacity={0.9} />
            <circle cx={cx} cy={cy} r={1.5} fill={style.colour} />
          </>
        )}
        {style.shape === 'square' && (
          <>
            <rect x={cx - r} y={cy - r} width={r * 2} height={r * 2} fill="none" stroke={style.colour} strokeWidth={1.5} strokeOpacity={0.9} />
            <circle cx={cx} cy={cy} r={1.2} fill={style.colour} />
          </>
        )}
        {style.shape === 'diamond' && (
          <polygon
            points={`${cx},${cy - r} ${cx + r},${cy} ${cx},${cy + r} ${cx - r},${cy}`}
            fill="none" stroke={style.colour} strokeWidth={1.5} strokeOpacity={0.9}
          />
        )}
        {isAdded && (
          <circle cx={cx} cy={cy} r={r + 2} fill="none" stroke="#00ff00" strokeWidth={0.8} strokeDasharray="2,2" />
        )}
        <title>{m.symbolCode} ({symbolDescriptions[m.symbolCode] || m.symbolCode}) — click to {isAdded ? 'remove' : 'toggle'}</title>
      </g>
    );
  };

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (editMode) setEditMode(null);
        else onClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, editMode]);

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex flex-col">
      {/* Header toolbar */}
      <div className="bg-white border-b px-4 py-2 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <div>
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Eye className="h-4 w-4" />
              Drawing Viewer — {drawingRef}
              {isVerified && <Badge className="bg-green-100 text-green-800 text-xs">Approved</Badge>}
            </h3>
          </div>
          <div className="flex items-center gap-1 ml-4">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleZoomOut}>
              <ZoomOut className="h-4 w-4" />
            </Button>
            <span className="text-xs font-mono w-12 text-center">{Math.round(zoom * 100)}%</span>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleZoomIn}>
              <ZoomIn className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleFit}>
              <Maximize className="h-4 w-4" />
            </Button>
            <Button
              variant={showOverlay ? "default" : "outline"}
              size="sm"
              className="h-8 text-xs ml-2"
              onClick={() => setShowOverlay(!showOverlay)}
            >
              {showOverlay ? <Eye className="h-3 w-3 mr-1" /> : <EyeOff className="h-3 w-3 mr-1" />}
              {showOverlay ? 'Overlay On' : 'Overlay Off'}
            </Button>

            {/* Edit mode toggle */}
            {!isVerified && (
              <div className="flex items-center gap-1 ml-3 border-l pl-3">
                <Button
                  variant={editMode ? "outline" : "ghost"}
                  size="sm"
                  className={`h-8 text-xs ${editMode ? 'bg-amber-50 border-amber-300 text-amber-700' : ''}`}
                  onClick={() => setEditMode(editMode ? null : Object.keys(liveCounts)[0] || 'J')}
                >
                  {editMode ? (
                    <><MousePointer2 className="h-3 w-3 mr-1" /> Pan Mode</>
                  ) : (
                    <><Plus className="h-3 w-3 mr-1" /> Edit Markers</>
                  )}
                </Button>

                {/* Save button */}
                {hasChanges && (
                  <Button
                    size="sm"
                    className="h-8 text-xs bg-green-600 hover:bg-green-700 text-white"
                    onClick={handleSaveEdits}
                    disabled={isSaving}
                  >
                    {isSaving ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Save className="h-3 w-3 mr-1" />}
                    Save ({removedIds.size > 0 ? `-${removedIds.size}` : ''}{addedMarkers.length > 0 ? `+${addedMarkers.length}` : ''})
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-5 w-5" />
        </Button>
      </div>

      {/* Symbol filter chips / edit mode selector */}
      <div className="bg-white border-b px-4 py-2 flex flex-wrap gap-1.5 flex-shrink-0">
        {editMode && (
          <span className="text-xs text-amber-700 font-medium mr-2 flex items-center">
            Place:
          </span>
        )}
        {Object.entries(liveCounts).sort(([a], [b]) => a.localeCompare(b)).map(([code, count]) => {
          const style = symbolStyles[code];
          const isHidden = hiddenCodes.has(code);
          const isSelected = editMode === code;
          return (
            <button
              key={code}
              className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border transition-all ${
                isSelected
                  ? 'bg-amber-100 border-amber-400 ring-2 ring-amber-300'
                  : isHidden
                    ? 'bg-gray-100 text-gray-400 border-gray-200 line-through'
                    : 'bg-white hover:bg-gray-50'
              }`}
              style={isHidden && !isSelected ? {} : {
                borderColor: isSelected ? undefined : (style?.colour ? `${style.colour}60` : '#ddd'),
                color: style?.colour || '#666',
              }}
              onClick={() => {
                if (editMode) {
                  // In edit mode, clicking selects which symbol to place
                  setEditMode(isSelected ? null : code);
                } else {
                  toggleCode(code);
                }
              }}
              title={editMode
                ? `${isSelected ? 'Deselect' : 'Select'} ${code} to place on drawing`
                : `${isHidden ? 'Show' : 'Hide'} ${code} (${symbolDescriptions[code] || code})`
              }
            >
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: isHidden ? '#ccc' : (style?.colour || '#888') }}
              />
              {code}: {count}
              {isHidden && !editMode && <EyeOff className="h-2.5 w-2.5 ml-0.5" />}
            </button>
          );
        })}
        <div className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-gray-100 text-gray-700">
          Showing: {visibleTotal}/{totalItems}
        </div>
        {hasChanges && (
          <div className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-700">
            Unsaved changes
          </div>
        )}
      </div>

      {/* Edit mode instructions bar */}
      {editMode && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-1.5 text-xs text-amber-800 flex items-center gap-2">
          <Plus className="h-3 w-3" />
          <span>
            <strong>Adding {editMode}</strong> — click on the drawing to place a marker. Click an existing marker to remove it. Press Escape to exit edit mode.
          </span>
        </div>
      )}

      {/* Drawing canvas */}
      <div
        ref={containerRef}
        className={`flex-1 overflow-hidden bg-gray-800 relative ${
          editMode ? 'cursor-crosshair' : 'cursor-grab active:cursor-grabbing'
        }`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        onClick={handleDrawingClick}
      >
        <div
          className="absolute"
          style={{
            transform: `translate(${position.x}px, ${position.y}px) scale(${zoom})`,
            transformOrigin: '0 0',
            transition: isDragging ? 'none' : 'transform 0.1s ease-out',
          }}
        >
          <div className="relative" style={pdfDimensions.width ? { width: pdfDimensions.width, height: pdfDimensions.height } : undefined}>
            {isLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-gray-700 z-10 min-h-[400px] min-w-[600px]">
                <div className="text-center">
                  <Loader2 className="h-8 w-8 animate-spin text-gray-400 mx-auto" />
                  <p className="text-gray-400 text-sm mt-2">Rendering drawing...</p>
                </div>
              </div>
            )}

            {renderError ? (
              <div className="flex items-center justify-center bg-gray-700 min-h-[400px] min-w-[600px]">
                <div className="text-center p-8">
                  <AlertTriangle className="h-12 w-12 text-amber-400 mx-auto mb-3" />
                  <p className="text-gray-300 text-sm">Failed to render PDF: {renderError}</p>
                  <p className="text-gray-500 text-xs mt-2">The symbol counts and positions are still available in the summary above.</p>
                </div>
              </div>
            ) : (
              <>
                <canvas ref={canvasRef} className="block" style={{ imageRendering: 'auto' }} />

                {/* Interactive SVG overlay */}
                {pdfDimensions.width > 0 && (
                  <svg
                    className="absolute top-0 left-0"
                    width={pdfDimensions.width}
                    height={pdfDimensions.height}
                    viewBox={`0 0 ${pdfDimensions.width} ${pdfDimensions.height}`}
                    style={{ pointerEvents: editMode || !isVerified ? 'all' : 'none' }}
                  >
                    {/* Original markers */}
                    {markers.map(m => renderMarker(m, removedIds.has(m.id), false))}

                    {/* Added markers */}
                    {addedMarkers.map(m => renderMarker(m, false, true))}

                    {/* Show removed markers as faded red X */}
                    {Array.from(removedIds).map(id => {
                      const m = markers.find(mk => mk.id === id);
                      if (!m || hiddenCodes.has(m.symbolCode) || !showOverlay) return null;
                      const cx = (m.x / pdfPageWidth) * pdfDimensions.width;
                      const cy = (m.y / pdfPageHeight) * pdfDimensions.height;
                      return (
                        <g
                          key={`removed-${id}`}
                          style={{ cursor: 'pointer', opacity: 0.5 }}
                          onClick={(e) => { e.stopPropagation(); handleMarkerClick(id, false); }}
                        >
                          <line x1={cx - 4} y1={cy - 4} x2={cx + 4} y2={cy + 4} stroke="red" strokeWidth={2} />
                          <line x1={cx + 4} y1={cy - 4} x2={cx - 4} y2={cy + 4} stroke="red" strokeWidth={2} />
                          <title>Removed {m.symbolCode} — click to restore</title>
                        </g>
                      );
                    })}
                  </svg>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
