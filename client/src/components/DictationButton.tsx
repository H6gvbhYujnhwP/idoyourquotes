/**
 * DictationButton — Live voice dictation using Web Speech API
 * 
 * Works on: Chrome (desktop/Android), Safari (macOS/iOS), Edge
 * Falls back gracefully on unsupported browsers
 * 
 * Usage:
 *   <DictationButton onTranscript={(text) => handleDictation(text)} />
 */
import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Mic, MicOff, Square, Loader2 } from "lucide-react";

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

interface DictationButtonProps {
  onTranscript: (text: string) => void;
  disabled?: boolean;
  className?: string;
  variant?: "default" | "inline";
}

export default function DictationButton({ 
  onTranscript, 
  disabled = false, 
  className = "",
  variant = "default",
}: DictationButtonProps) {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interimText, setInterimText] = useState("");
  const [isSupported, setIsSupported] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const finalTranscriptRef = useRef("");

  // Check browser support
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
        // Ignore — user just hasn't spoken yet
      } else if (event.error === "network") {
        setError("Network error. Please check your connection.");
      } else {
        setError(`Speech recognition error: ${event.error}`);
      }
    };

    recognition.onend = () => {
      setIsListening(false);
      // On mobile Safari, recognition can stop unexpectedly — don't treat as final
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

    // Send the final transcript
    const fullText = (finalTranscriptRef.current + " " + interimText).trim();
    if (fullText) {
      onTranscript(fullText);
      setTranscript("");
      setInterimText("");
      finalTranscriptRef.current = "";
    }
  }, [interimText, onTranscript]);

  const cancelListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.abort();
    }
    setIsListening(false);
    setTranscript("");
    setInterimText("");
    finalTranscriptRef.current = "";
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    };
  }, []);

  if (!isSupported) {
    return null; // Don't show button if not supported
  }

  const displayText = transcript + (interimText ? " " + interimText : "");

  // Inline variant — small mic icon for text areas
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

  // Default variant — full dictation panel
  return (
    <div className={`space-y-3 ${className}`}>
      {/* Main button */}
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
      </div>

      {/* Live transcript preview */}
      {isListening && (
        <div className="p-3 rounded-lg border-2 border-red-200 bg-red-50/50 min-h-[60px]">
          <p className="text-sm text-gray-700 leading-relaxed">
            {displayText || (
              <span className="text-muted-foreground italic">Speak now — describe the job, materials, labour, and any other details for the quote...</span>
            )}
            {interimText && <span className="text-muted-foreground">|</span>}
          </p>
        </div>
      )}

      {/* Completed transcript */}
      {!isListening && transcript && (
        <div className="p-3 rounded-lg border border-green-200 bg-green-50/50">
          <p className="text-sm text-gray-700">{transcript}</p>
        </div>
      )}

      {/* Error */}
      {error && (
        <p className="text-xs text-red-600">{error}</p>
      )}
    </div>
  );
}
