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
} from "lucide-react";

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
    const lower = processingInstructions.toLowerCase();
    const excluded = new Set<string>();

    const isLightingOnly = (lower.includes('lighting only') || lower.includes('lights only')) ||
      (lower.includes('lighting') && !lower.includes('fire alarm') && lower.includes('exclude'));
    const excludeFireAlarm = lower.includes('exclude fire alarm') || lower.includes('no fire alarm') ||
      lower.includes('excluding fire') || lower.includes('not fire');

    const fireAlarmCodes = ['SO', 'CO', 'HF', 'HC', 'HR', 'CO2', 'SB', 'FARP', 'VESDA'];

    if (excludeFireAlarm || isLightingOnly) {
      for (const code of fireAlarmCodes) {
        if (rawCounts[code]) excluded.add(code);
      }
    }

    if (isLightingOnly) {
      for (const [code] of Object.entries(rawCounts)) {
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

    return excluded;
  }, [processingInstructions, rawCounts, rawSymbolDescriptions, takeoffData]);

  const filteredCounts = useMemo(() => {
    const filtered: Record<string, number> = {};
    for (const [code, count] of Object.entries(rawCounts)) {
      if (!excludedCodes.has(code)) {
        filtered[code] = count;
      }
    }
    return filtered;
  }, [rawCounts, excludedCodes]);

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
  const hasFilter = excludedCodes.size > 0;

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
              {isVerified ? 'Approved' : 'Takeoff Ready'}
            </span>
            {isVerified && (
              <Button
                variant="outline"
                size="sm"
                className="h-6 text-xs text-amber-600 border-amber-300 hover:bg-amber-50 px-2"
                onClick={() => {
                  if (takeoff?.id) unlockMutation.mutate({ takeoffId: takeoff.id });
                }}
                disabled={unlockMutation.isPending}
              >
                {unlockMutation.isPending ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Lock className="h-3 w-3 mr-1" />
                )}
                Edit
              </Button>
            )}
            <Badge variant="outline" className="text-xs">
              {hasFilter ? `${filteredTotal} in scope` : `${totalItems} items`}
            </Badge>
            {hasFilter && (
              <Badge variant="outline" className="text-xs text-gray-400 border-gray-200">
                {totalItems - filteredTotal} excluded
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1">
            {/* View Drawing button */}
            {svgOverlay && (
              <Button
                size="sm"
                variant="outline"
                className="text-xs h-7"
                onClick={() => setShowViewer(true)}
              >
                <Image className="h-3 w-3 mr-1" />
                View Marked Drawing
              </Button>
            )}
            {takeoff.hasTextLayer === false && (
              <Badge variant="destructive" className="text-xs">
                <AlertTriangle className="h-3 w-3 mr-1" />
                No text layer
              </Badge>
            )}
          </div>
        </div>

        {/* Symbol count chips */}
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)).map(([code, count]) => {
            const style = symbolStyles[code];
            const isExcluded = excludedCodes.has(code);
            return (
              <div
                key={code}
                className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${
                  isExcluded ? 'bg-gray-50 line-through opacity-50' : 'bg-white'
                }`}
                style={isExcluded ? { borderColor: '#ddd', color: '#999' } : {
                  borderColor: style?.colour ? `${style.colour}60` : '#ddd',
                  color: style?.colour || '#666',
                }}
                title={isExcluded ? `${code} excluded by processing instructions` : `${code}: ${symbolDescriptions[code] || code}`}
              >
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: isExcluded ? '#ccc' : (style?.colour || '#888') }}
                />
                {code}: {count}
              </div>
            );
          })}
        </div>
      </div>

      {/* Expandable Chat / Q&A Section */}
      <div className="border rounded-lg overflow-hidden">
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
          Ready for Quote
        </Button>
      )}

      {/* Full-screen Drawing Viewer Modal */}
      {showViewer && svgOverlay && (
        <DrawingViewerModal
          inputId={inputId}
          svgOverlay={svgOverlay}
          counts={counts}
          symbolStyles={symbolStyles}
          symbolDescriptions={symbolDescriptions}
          drawingRef={takeoff.drawingRef || filename}
          isVerified={isVerified}
          initialHiddenCodes={excludedCodes}
          onClose={() => setShowViewer(false)}
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
      const lightingTotal = lightingCodes.reduce((sum, [, c]) => sum + c, 0);
      response = `Noted — filtering to lighting items only. Your lighting scope includes:\n\n${lightingCodes.map(([code, count]) => `• ${code} (${symbolDescriptions[code] || code}): ${count}`).join('\n')}\n\nLighting total: ${lightingTotal} items.\n\nFire alarm and other non-lighting symbols will be excluded from the quote. You can verify these counts and they'll be passed to the quote generator with the lighting-only scope.`;
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
        {/* Initial summary message */}
        <div className="flex gap-2">
          <div className="h-7 w-7 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 mt-0.5">
            <Bot className="h-4 w-4 text-blue-600" />
          </div>
          <div className="flex-1 bg-blue-50 rounded-lg p-3 text-sm">
            <p className="font-medium text-blue-900 mb-2">
              Extraction complete — {totalItems} items detected
            </p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-blue-800">
              {Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)).map(([code, count]) => (
                <div key={code} className="flex items-center gap-1">
                  <span className="font-mono font-bold w-6 text-right">{count}</span>
                  <span className="text-blue-600">×</span>
                  <span>{code} ({symbolDescriptions[code] || code})</span>
                </div>
              ))}
            </div>
          </div>
        </div>

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
              Ready for Quote
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

interface DrawingViewerModalProps {
  inputId: number;
  svgOverlay: string;
  counts: Record<string, number>;
  symbolStyles: Record<string, { colour: string; shape: string; radius: number }>;
  symbolDescriptions: Record<string, string>;
  drawingRef: string;
  isVerified?: boolean;
  initialHiddenCodes?: Set<string>;
  onClose: () => void;
}

function DrawingViewerModal({
  inputId,
  svgOverlay,
  counts,
  symbolStyles,
  symbolDescriptions,
  drawingRef,
  isVerified = false,
  initialHiddenCodes,
  onClose,
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

  const containerRef = useRef<HTMLDivElement>(null);

  // Zoom towards a specific point (in container coordinates)
  const zoomToPoint = (newZoom: number, clientX: number, clientY: number) => {
    const clampedZoom = Math.max(0.25, Math.min(5, newZoom));
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) {
      setZoom(clampedZoom);
      return;
    }

    // Mouse position relative to the container
    const mouseX = clientX - rect.left;
    const mouseY = clientY - rect.top;

    // Point on the content that the mouse is over (in content coordinates)
    const contentX = (mouseX - position.x) / zoom;
    const contentY = (mouseY - position.y) / zoom;

    // After zoom, that same content point should still be under the mouse
    const newX = mouseX - contentX * clampedZoom;
    const newY = mouseY - contentY * clampedZoom;

    setZoom(clampedZoom);
    setPosition({ x: newX, y: newY });
  };

  // Toolbar zoom buttons — zoom towards centre of viewport
  const handleZoomIn = () => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) {
      zoomToPoint(zoom + 0.25, rect.left + rect.width / 2, rect.top + rect.height / 2);
    } else {
      setZoom(z => Math.min(z + 0.25, 5));
    }
  };
  const handleZoomOut = () => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) {
      zoomToPoint(zoom - 0.25, rect.left + rect.width / 2, rect.top + rect.height / 2);
    } else {
      setZoom(z => Math.max(z - 0.25, 0.25));
    }
  };
  const handleFit = () => { setZoom(1); setPosition({ x: 0, y: 0 }); };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
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

  // Fetch PDF data through server proxy (avoids CORS with R2)
  const { data: pdfData } = trpc.electricalTakeoff.getPdfData.useQuery(
    { inputId },
    { enabled: !!inputId }
  );

  // Render PDF to canvas using pdfjs-dist loaded from CDN
  useEffect(() => {
    if (!pdfData?.base64 || !canvasRef.current) return;

    let cancelled = false;

    const renderPdf = async () => {
      try {
        setIsLoading(true);
        setRenderError(null);

        // Load pdfjs from CDN if not already available
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
              } else {
                reject(new Error('pdfjsLib not found after loading'));
              }
            };
            script.onerror = () => reject(new Error('Failed to load PDF.js'));
            document.head.appendChild(script);
          });
        }

        const pdfjsLib = (window as any).pdfjsLib;
        if (!pdfjsLib) throw new Error('PDF.js not available');

        // Convert base64 to Uint8Array
        const binaryString = atob(pdfData.base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }

        if (cancelled) return;

        // Load the PDF document
        const loadingTask = pdfjsLib.getDocument({ data: bytes });
        const pdf = await loadingTask.promise;
        const page = await pdf.getPage(1);

        if (cancelled) return;

        // Render at 2x scale for crisp display
        const renderScale = 2;
        const viewport = page.getViewport({ scale: renderScale });

        const canvas = canvasRef.current;
        if (!canvas) return;

        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.width = `${viewport.width / renderScale}px`;
        canvas.style.height = `${viewport.height / renderScale}px`;

        setPdfDimensions({
          width: viewport.width / renderScale,
          height: viewport.height / renderScale,
        });

        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Cannot get canvas context');

        await page.render({ canvasContext: ctx, viewport }).promise;

        if (!cancelled) {
          setIsLoading(false);
        }
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

  // Filter SVG overlay to hide toggled-off symbol codes
  const getFilteredOverlay = () => {
    if (hiddenCodes.size === 0) return svgOverlay;
    let filtered = svgOverlay;
    for (const code of hiddenCodes) {
      const regex = new RegExp(
        `<g class="takeoff-marker" data-id="[^"]*" data-code="${code}"[^>]*>[\\s\\S]*?</g>`,
        'g'
      );
      filtered = filtered.replace(regex, '');
    }
    return filtered;
  };

  const toggleCode = (code: string) => {
    setHiddenCodes(prev => {
      const next = new Set(prev);
      if (next.has(code)) {
        next.delete(code);
      } else {
        next.add(code);
      }
      return next;
    });
  };

  const totalItems = Object.values(counts).reduce((a, b) => a + b, 0);
  const visibleTotal = Object.entries(counts)
    .filter(([code]) => !hiddenCodes.has(code))
    .reduce((sum, [, count]) => sum + count, 0);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex flex-col">
      {/* Header toolbar */}
      <div className="bg-white border-b px-4 py-2 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <div>
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Eye className="h-4 w-4" />
              Drawing Viewer — {drawingRef}
              {isVerified && (
                <Badge className="bg-green-100 text-green-800 text-xs">Approved</Badge>
              )}
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
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-5 w-5" />
        </Button>
      </div>

      {/* Symbol filter chips */}
      <div className="bg-white border-b px-4 py-2 flex flex-wrap gap-1.5 flex-shrink-0">
        {Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)).map(([code, count]) => {
          const style = symbolStyles[code];
          const isHidden = hiddenCodes.has(code);
          return (
            <button
              key={code}
              className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border transition-all ${
                isHidden
                  ? 'bg-gray-100 text-gray-400 border-gray-200 line-through'
                  : 'bg-white hover:bg-gray-50'
              }`}
              style={isHidden ? {} : {
                borderColor: style?.colour ? `${style.colour}60` : '#ddd',
                color: style?.colour || '#666',
              }}
              onClick={() => toggleCode(code)}
              title={`${isHidden ? 'Show' : 'Hide'} ${code} (${symbolDescriptions[code] || code})`}
            >
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: isHidden ? '#ccc' : (style?.colour || '#888') }}
              />
              {code}: {count}
              {isHidden && <EyeOff className="h-2.5 w-2.5 ml-0.5" />}
            </button>
          );
        })}
        <div className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-gray-100 text-gray-700">
          Showing: {visibleTotal}/{totalItems}
        </div>
      </div>

      {/* Drawing canvas */}
      <div
        ref={containerRef}
        className="flex-1 overflow-hidden bg-gray-800 cursor-grab active:cursor-grabbing relative"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
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
                  <p className="text-gray-300 text-sm">
                    Failed to render PDF: {renderError}
                  </p>
                  <p className="text-gray-500 text-xs mt-2">
                    The symbol counts and positions are still available in the summary above.
                  </p>
                </div>
              </div>
            ) : (
              <>
                {/* PDF rendered to canvas */}
                <canvas
                  ref={canvasRef}
                  className="block"
                  style={{ imageRendering: 'auto' }}
                />

                {/* SVG overlay positioned over the canvas */}
                {showOverlay && pdfDimensions.width > 0 && (
                  <div
                    className="absolute top-0 left-0"
                    style={{
                      width: pdfDimensions.width,
                      height: pdfDimensions.height,
                    }}
                    dangerouslySetInnerHTML={{ __html: getFilteredOverlay() }}
                  />
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
