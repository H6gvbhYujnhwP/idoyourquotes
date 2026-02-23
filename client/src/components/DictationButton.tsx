/**
 * DictationButton — Live voice dictation with smart command detection
 * 
 * Voice commands detected:
 * - "remove that" / "delete the last one" / "scratch that" → deletes previous dictation
 * - "change that to..." / "actually make it..." / "replace that with..." → replaces previous
 * - "build the quote" / "generate the quote" / "that's it" → triggers quote generation
 * - Everything else → saves as a new voice input
 * 
 * Works on: Chrome (desktop/Android), Safari (macOS/iOS), Edge
 */
import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Mic, Square } from "lucide-react";

// Extend Window type for webkitSpeechRecognition
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message: string;
}

interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognitionInstance;
    webkitSpeechRecognition: new () => SpeechRecognitionInstance;
  }
}

// Voice command patterns
const REMOVE_PATTERNS = [
  /^(remove|delete|scratch|scrap|undo|get rid of)\s+(that|the last one|the last|what i (just )?said|my last|previous)/i,
  /^scratch that$/i,
  /^never\s*mind\s*(that)?$/i,
  /^undo\s*(that)?$/i,
];

const CHANGE_PATTERNS = [
  /^(change|replace|update|modify|alter)\s+(that|the last one|it)\s+(to|with)\s+/i,
  /^actually\s+(make it|change it to|it should be|it's|its)\s+/i,
  /^no\s*,?\s*(make it|it should be|it's|change it to)\s+/i,
  /^wait\s*,?\s*(make it|change|it should be)\s+/i,
];

const BUILD_PATTERNS = [
  /\b(build|generate|create|make|do)\s+(the|my|a)?\s*(quote|draft|proposal)\b/i,
  /^that'?s?\s*(it|all|everything|the lot)\s*[,.]?\s*(build|generate|create|go|do it|make)?\s*(the|my|a)?\s*(quote|draft|it)?/i,
  /^go\s*ahead\s*(and)?\s*(build|generate|create|make)?\s*(the|my|a)?\s*(quote|draft)?/i,
  /^done\.?\s*(build|generate|create)?\s*(the|my|a)?\s*(quote|draft)?/i,
];

export type DictationCommand = 
  | { type: "add"; text: string }
  | { type: "remove" }
  | { type: "change"; text: string }
  | { type: "build" }
  | { type: "build_with_text"; text: string };

function detectCommand(text: string): DictationCommand {
  const trimmed = text.trim();
  
  // Check for remove/delete commands
  for (const pattern of REMOVE_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { type: "remove" };
    }
  }

  // Check for change/replace commands — extract the replacement text
  for (const pattern of CHANGE_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match) {
      const replacement = trimmed.slice(match[0].length).trim();
      if (replacement) {
        return { type: "change", text: replacement };
      }
    }
  }

  // Check for build/generate commands
  for (const pattern of BUILD_PATTERNS) {
    if (pattern.test(trimmed)) {
      // Check if there's content before the build command
      const beforeBuild = trimmed.replace(pattern, "").trim();
      if (beforeBuild && beforeBuild.length > 15) {
        return { type: "build_with_text", text: beforeBuild };
      }
      return { type: "build" };
    }
  }

  // Default: add as new dictation
  return { type: "add", text: trimmed };
}

interface DictationButtonProps {
  onCommand?: (command: DictationCommand) => void;
  disabled?: boolean;
  className?: string;
  variant?: "default" | "inline";
  /** Simple mode: just returns text, no command detection */
  onTranscript?: (text: string) => void;
  /** Auto-start listening when mounted or when this value changes to true */
  autoStart?: boolean;
  /** Called when listening stops (Done/Cancel/error) — useful to reset parent state */
  onListeningChange?: (isListening: boolean) => void;
}

export default function DictationButton({ 
  onCommand,
  onTranscript,
  disabled = false, 
  className = "",
  variant = "default",
  autoStart = false,
  onListeningChange,
}: DictationButtonProps) {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interimText, setInterimText] = useState("");
  const [isSupported, setIsSupported] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const finalTranscriptRef = useRef("");

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setIsSupported(false);
    }
  }, []);

  const startListening = useCallback(() => {
    setError(null);
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError("Speech recognition not supported in this browser. Try Chrome or Safari.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-GB";
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsListening(true);
      setTranscript("");
      setInterimText("");
      finalTranscriptRef.current = "";
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let finalText = "";
      let interimTextValue = "";

      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalText += result[0].transcript;
        } else {
          interimTextValue += result[0].transcript;
        }
      }

      if (finalText) {
        finalTranscriptRef.current = finalText;
        setTranscript(finalText);
      }
      setInterimText(interimTextValue);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error("[Dictation] Error:", event.error);
      if (event.error === "not-allowed") {
        setError("Microphone access denied. Please allow microphone access in your browser settings.");
      } else if (event.error === "no-speech") {
        // Ignore
      } else if (event.error === "network") {
        setError("Network error. Please check your connection.");
      } else {
        setError(`Speech recognition error: ${event.error}`);
      }
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;

    try {
      recognition.start();
    } catch (err) {
      setError("Failed to start speech recognition. Please try again.");
      setIsListening(false);
    }
  }, []);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    setIsListening(false);

    const fullText = (finalTranscriptRef.current + " " + interimText).trim();
    if (fullText) {
      if (onTranscript) {
        onTranscript(fullText);
      } else if (onCommand) {
        const command = detectCommand(fullText);
        onCommand(command);
      }
      setTranscript("");
      setInterimText("");
      finalTranscriptRef.current = "";
    }
  }, [interimText, onCommand, onTranscript]);

  const cancelListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.abort();
    }
    setIsListening(false);
    setTranscript("");
    setInterimText("");
    finalTranscriptRef.current = "";
  }, []);

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    };
  }, []);

  // Auto-start listening when autoStart prop becomes true
  useEffect(() => {
    if (autoStart && !isListening && !disabled) {
      // Small delay to let React finish rendering before starting recognition
      const timer = setTimeout(() => {
        startListening();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [autoStart]); // eslint-disable-line react-hooks/exhaustive-deps

  // Notify parent when listening state changes (skip initial mount)
  const hasStartedRef = useRef(false);
  useEffect(() => {
    if (isListening) {
      hasStartedRef.current = true;
    }
    if (hasStartedRef.current) {
      onListeningChange?.(isListening);
    }
  }, [isListening]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isSupported) {
    return null;
  }

  const displayText = transcript + (interimText ? " " + interimText : "");

  // Real-time command detection for visual feedback
  const liveCommand = displayText ? detectCommand(displayText) : null;
  const commandLabel = liveCommand?.type === "remove" ? "Will remove last voice note"
    : liveCommand?.type === "change" ? "Will update last voice note"
    : liveCommand?.type === "build" ? "Will generate your quote"
    : liveCommand?.type === "build_with_text" ? "Will save & generate quote"
    : null;

  // Inline variant
  if (variant === "inline") {
    return (
      <button
        type="button"
        onClick={isListening ? stopListening : startListening}
        disabled={disabled}
        className={`p-1.5 rounded-md transition-all ${
          isListening 
            ? "bg-red-100 text-red-600 animate-pulse" 
            : "hover:bg-muted text-muted-foreground hover:text-foreground"
        } ${className}`}
        title={isListening ? "Stop dictating" : "Dictate with voice"}
      >
        {isListening ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
      </button>
    );
  }

  // Default variant
  return (
    <div className={`space-y-3 ${className}`}>
      <div className="flex items-center gap-2">
        {!isListening ? (
          <Button
            type="button"
            onClick={startListening}
            disabled={disabled}
            variant="outline"
            className="gap-2 border-green-300 text-green-700 hover:bg-green-50 hover:text-green-800 hover:border-green-400"
          >
            <Mic className="h-4 w-4" />
            Dictate
          </Button>
        ) : (
          <div className="flex items-center gap-2">
            <Button
              type="button"
              onClick={stopListening}
              className="gap-2 bg-red-600 hover:bg-red-700 text-white"
            >
              <Square className="h-4 w-4" />
              Done
            </Button>
            <Button
              type="button"
              onClick={cancelListening}
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
            >
              Cancel
            </Button>
            <div className="flex items-center gap-1.5 ml-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
              </span>
              <span className="text-xs text-red-600 font-medium">Listening...</span>
            </div>
          </div>
        )}
        {!isListening && (
          <span className="text-xs text-muted-foreground">
            Describe the job, or say "remove that", "change that to...", or "build the quote"
          </span>
        )}
      </div>

      {/* Live transcript preview with command detection */}
      {isListening && (
        <div className={`p-3 rounded-lg border-2 min-h-[60px] ${
          commandLabel 
            ? liveCommand?.type === "remove" ? "border-amber-300 bg-amber-50/50"
              : liveCommand?.type === "build" || liveCommand?.type === "build_with_text" ? "border-green-300 bg-green-50/50"
              : "border-blue-300 bg-blue-50/50"
            : "border-red-200 bg-red-50/50"
        }`}>
          {commandLabel && (
            <div className={`text-xs font-medium mb-1 ${
              liveCommand?.type === "remove" ? "text-amber-600"
                : liveCommand?.type === "build" || liveCommand?.type === "build_with_text" ? "text-green-600"
                : "text-blue-600"
            }`}>
              {liveCommand?.type === "remove" && "⏪ "}
              {(liveCommand?.type === "build" || liveCommand?.type === "build_with_text") && "⚡ "}
              {liveCommand?.type === "change" && "✏️ "}
              {commandLabel}
            </div>
          )}
          <p className="text-sm text-gray-700 leading-relaxed">
            {displayText || (
              <span className="text-muted-foreground italic">
                Speak now — describe the job, materials, labour, pricing...
                <br />
                <span className="text-xs">
                  Say "remove that" to undo, "change that to..." to edit, or "build the quote" when ready
                </span>
              </span>
            )}
            {interimText && <span className="text-muted-foreground">|</span>}
          </p>
        </div>
      )}

      {error && (
        <p className="text-xs text-red-600">{error}</p>
      )}
    </div>
  );
}

export { detectCommand };
