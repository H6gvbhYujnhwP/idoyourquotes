import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Bot, CheckCircle, AlertTriangle, MessageCircle } from "lucide-react";

interface TakeoffQuestion {
  id: string;
  question: string;
  context: string;
  options: Array<{ label: string; value: string }>;
  defaultValue?: string;
  symbolsAffected: number;
}

interface TakeoffChatProps {
  questions: TakeoffQuestion[];
  counts: Record<string, number>;
  drawingRef: string;
  symbolDescriptions: Record<string, string>;
  onAnswersSubmitted: (answers: Record<string, string>) => void;
  onVerify: () => void;
  isSubmitting?: boolean;
  isVerified?: boolean;
}

export default function TakeoffChat({
  questions,
  counts,
  drawingRef,
  symbolDescriptions,
  onAnswersSubmitted,
  onVerify,
  isSubmitting = false,
  isVerified = false,
}: TakeoffChatProps) {
  const [answers, setAnswers] = useState<Record<string, string>>(() => {
    const defaults: Record<string, string> = {};
    for (const q of questions) {
      if (q.defaultValue) defaults[q.id] = q.defaultValue;
    }
    return defaults;
  });
  const [answeredIds, setAnsweredIds] = useState<Set<string>>(new Set());

  const handleAnswer = (questionId: string, value: string) => {
    setAnswers(prev => ({ ...prev, [questionId]: value }));
  };

  const handleConfirmQuestion = (questionId: string) => {
    setAnsweredIds(prev => new Set([...prev, questionId]));
  };

  const allAnswered = questions.every(q => answeredIds.has(q.id));

  const handleSubmitAll = () => {
    onAnswersSubmitted(answers);
    // Mark all as answered
    setAnsweredIds(new Set(questions.map(q => q.id)));
  };

  const totalItems = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Bot className="h-5 w-5 text-blue-500" />
          AI Takeoff Assistant
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          {drawingRef}
        </p>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col gap-3 overflow-hidden">
        <ScrollArea className="flex-1">
          <div className="space-y-4 pr-3">
            {/* Initial summary message */}
            <div className="flex gap-2">
              <div className="h-7 w-7 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Bot className="h-4 w-4 text-blue-600" />
              </div>
              <div className="flex-1 bg-blue-50 rounded-lg p-3 text-sm">
                <p className="font-medium text-blue-900 mb-2">
                  Extraction complete — {totalItems} items detected
                </p>
                <div className="grid grid-cols-2 gap-1 text-xs text-blue-800">
                  {Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)).map(([code, count]) => (
                    <div key={code} className="flex justify-between">
                      <span>{code} ({symbolDescriptions[code] || code})</span>
                      <span className="font-mono font-bold ml-2">{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Questions */}
            {questions.map((q, idx) => (
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

            {/* All answered state */}
            {questions.length > 0 && allAnswered && !isVerified && (
              <div className="flex gap-2">
                <div className="h-7 w-7 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                </div>
                <div className="flex-1 bg-green-50 rounded-lg p-3 text-sm">
                  <p className="font-medium text-green-900">
                    All questions answered. Review the marked-up drawing, then verify the counts.
                  </p>
                </div>
              </div>
            )}

            {/* No questions state */}
            {questions.length === 0 && !isVerified && (
              <div className="flex gap-2">
                <div className="h-7 w-7 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Bot className="h-4 w-4 text-green-600" />
                </div>
                <div className="flex-1 bg-green-50 rounded-lg p-3 text-sm">
                  <p className="font-medium text-green-900">
                    No ambiguities detected. Review the marked-up drawing, then verify the counts.
                  </p>
                </div>
              </div>
            )}

            {/* Verified state */}
            {isVerified && (
              <div className="flex gap-2">
                <div className="h-7 w-7 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                </div>
                <div className="flex-1 bg-green-100 rounded-lg p-3 text-sm border border-green-300">
                  <p className="font-bold text-green-900">
                    ✅ Counts verified and locked
                  </p>
                  <p className="text-xs text-green-700 mt-1">
                    These quantities will be used in your quote generation.
                  </p>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Action buttons */}
        <div className="flex gap-2 pt-2 border-t">
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
              Counts Verified
            </Button>
          )}
          {isVerified && (
            <Badge className="flex-1 justify-center py-2 bg-green-100 text-green-800 hover:bg-green-100">
              <CheckCircle className="h-4 w-4 mr-1" />
              Verified
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
