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
import { createPortal } from "react-dom";
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
  variant?: "default" | "inline" | "floating" | "modal";
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

  // ── Long-form dictation: auto-restart on browser-auto-end ─────────────────
  //
  // The Web Speech API auto-ends recognition after a browser-defined idle
  // period (typically ~60 seconds in Chrome). That's not enough time to
  // dictate a full quote brief, so we auto-restart on `onend` unless the
  // user explicitly stopped/cancelled, capped at 10 minutes total per
  // session as a fail-safe.
  //
  //   isUserStoppedRef — set true by stopListening / cancelListening BEFORE
  //                      calling stop()/abort(), so the onend handler knows
  //                      the end is user-initiated (don't restart).
  //   sessionStartedAtRef — wall-clock time the user first hit start.
  //                         Cleared when user-stopped or fail-safe hit.
  //   accumulatedTranscriptRef — running transcript across every restart
  //                              within a single user-driven session.
  //                              finalTranscriptRef still holds the current
  //                              browser session's final text on its own;
  //                              we concat them when emitting.
  //
  // 10-minute cap chosen as a practical upper bound — long enough for any
  // realistic quote brief, short enough to prevent a forgotten mic from
  // burning the user's battery or filling the network with empty audio.
  const isUserStoppedRef = useRef(false);
  const sessionStartedAtRef = useRef<number | null>(null);
  const accumulatedTranscriptRef = useRef("");
  const MAX_SESSION_MS = 10 * 60 * 1000;

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

    // First-press initialisation. If we're already inside an auto-restart
    // (sessionStartedAtRef is already set), preserve the accumulated text.
    const isFreshStart = sessionStartedAtRef.current === null;
    if (isFreshStart) {
      isUserStoppedRef.current = false;
      sessionStartedAtRef.current = Date.now();
      accumulatedTranscriptRef.current = "";
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-GB";
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsListening(true);
      // On a FRESH start (user just hit the button) reset visible transcript.
      // On an AUTO-RESTART (browser timed out, we're starting again) keep
      // the visible transcript showing the accumulated text so the user
      // sees no flicker / no apparent text loss.
      if (isFreshStart) {
        setTranscript("");
        setInterimText("");
      } else {
        setTranscript(accumulatedTranscriptRef.current);
        setInterimText("");
      }
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
        // Visible transcript is the running accumulator plus this session's
        // final text. Keeps the UI showing the full long-form dictation
        // even after a mid-session browser auto-restart.
        const combined = (accumulatedTranscriptRef.current + " " + finalText).trim();
        setTranscript(combined);
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
      // Roll any final text from this browser session into the running
      // accumulator BEFORE deciding whether to auto-restart.
      if (finalTranscriptRef.current) {
        accumulatedTranscriptRef.current = (
          accumulatedTranscriptRef.current + " " + finalTranscriptRef.current
        ).trim();
      }

      // User-stopped path — clean shutdown, no restart.
      if (isUserStoppedRef.current) {
        setIsListening(false);
        return;
      }

      // Fail-safe cap — 10 minutes total per dictation. Forced stop.
      const elapsed = sessionStartedAtRef.current
        ? Date.now() - sessionStartedAtRef.current
        : 0;
      if (elapsed >= MAX_SESSION_MS) {
        setIsListening(false);
        // Stamp the cap reason so the user understands the auto-end.
        setError("Dictation auto-stopped after 10 minutes. Press the mic to continue.");
        sessionStartedAtRef.current = null;
        return;
      }

      // Auto-restart path — browser timed out, user still wants to dictate.
      // Reinvoke startListening on the same session. isFreshStart will
      // evaluate to false because sessionStartedAtRef is still set, which
      // preserves the accumulated transcript across the restart.
      try {
        startListening();
      } catch {
        // If restart fails (mic released, page hidden, etc.), surface
        // gracefully — drop into the user-stopped end state.
        setIsListening(false);
        sessionStartedAtRef.current = null;
      }
    };

    recognitionRef.current = recognition;

    try {
      recognition.start();
    } catch (err) {
      setError("Failed to start speech recognition. Please try again.");
      setIsListening(false);
      sessionStartedAtRef.current = null;
    }
  }, []);

  const stopListening = useCallback(() => {
    // Mark user-stopped BEFORE telling recognition to stop, so the onend
    // handler that fires asynchronously knows not to auto-restart.
    isUserStoppedRef.current = true;
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    setIsListening(false);

    // Emit the combined transcript: accumulated text from any auto-restart
    // cycles + the current session's final + any in-flight interim text.
    const combined = (
      accumulatedTranscriptRef.current +
      " " +
      finalTranscriptRef.current +
      " " +
      interimText
    ).trim();
    if (combined) {
      if (onTranscript) {
        onTranscript(combined);
      } else if (onCommand) {
        const command = detectCommand(combined);
        onCommand(command);
      }
      setTranscript("");
      setInterimText("");
      finalTranscriptRef.current = "";
      accumulatedTranscriptRef.current = "";
    }
    sessionStartedAtRef.current = null;
  }, [interimText, onCommand, onTranscript]);

  const cancelListening = useCallback(() => {
    // Mark user-stopped so onend doesn't auto-restart.
    isUserStoppedRef.current = true;
    if (recognitionRef.current) {
      recognitionRef.current.abort();
    }
    setIsListening(false);
    setTranscript("");
    setInterimText("");
    finalTranscriptRef.current = "";
    accumulatedTranscriptRef.current = "";
    sessionStartedAtRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        // Component unmount — abort cleanly and prevent any pending onend
        // from spawning a restart.
        isUserStoppedRef.current = true;
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

  // Elapsed-seconds counter — used by the modal variant header.
  // Resets to 0 every time listening stops; ticks 1/sec while active.
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  useEffect(() => {
    if (!isListening) {
      setElapsedSeconds(0);
      return;
    }
    const interval = setInterval(() => {
      setElapsedSeconds(s => s + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [isListening]);

  // ESC key cancels dictation when the modal is open.
  // Only registers when variant === "modal" AND listening — otherwise no-op.
  useEffect(() => {
    if (variant !== "modal" || !isListening) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        cancelListening();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [variant, isListening, cancelListening]);

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

  // Floating variant — compact dark-themed bar for fixed bottom overlay
  if (variant === "floating") {
    return (
      <div className={className}>
        {/* Live transcript — full width on top */}
        {isListening && (
          <div style={{
            minHeight: 48, padding: "8px 12px", borderRadius: 8, marginBottom: 10,
            backgroundColor: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.15)",
          }}>
            {commandLabel && (
              <div style={{
                fontSize: 10, fontWeight: 700, marginBottom: 2,
                color: liveCommand?.type === "remove" ? "#fbbf24"
                  : liveCommand?.type === "build" || liveCommand?.type === "build_with_text" ? "#34d399"
                  : "#60a5fa",
              }}>
                {liveCommand?.type === "remove" && "⏪ "}{liveCommand?.type === "build" || liveCommand?.type === "build_with_text" ? "⚡ " : ""}{liveCommand?.type === "change" && "✏️ "}{commandLabel}
              </div>
            )}
            <p style={{
              fontSize: 14, color: displayText ? "#e2e8f0" : "#64748b", lineHeight: 1.5,
              margin: 0, wordBreak: "break-word",
            }}>
              {displayText || "Speak now — describe the job, materials, pricing..."}
              {interimText && <span style={{ color: "#64748b" }}>|</span>}
            </p>
          </div>
        )}

        {/* Bottom row: status + buttons */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          {/* Pulsing recording indicator */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            {isListening && (
              <span style={{ position: "relative", display: "flex", height: 12, width: 12 }}>
                <span style={{
                  position: "absolute", display: "inline-flex", height: "100%", width: "100%",
                  borderRadius: "50%", backgroundColor: "#f87171", opacity: 0.75,
                  animation: "ping 1s cubic-bezier(0,0,0.2,1) infinite",
                }} />
                <span style={{
                  position: "relative", display: "inline-flex", height: 12, width: 12,
                  borderRadius: "50%", backgroundColor: "#ef4444",
                }} />
              </span>
            )}
            <span style={{ color: isListening ? "#f87171" : "#94a3b8", fontSize: 13, fontWeight: 600 }}>
              {isListening ? "Listening..." : "Ready"}
            </span>
          </div>

          {/* Action buttons */}
          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
            {isListening ? (
              <>
                <button
                  type="button"
                  onClick={stopListening}
                  style={{
                    padding: "10px 24px", borderRadius: 8, border: "none", cursor: "pointer",
                    backgroundColor: "#ef4444", color: "white", fontSize: 14, fontWeight: 700,
                    display: "flex", alignItems: "center", gap: 6,
                  }}
                >
                  <Square style={{ height: 14, width: 14 }} />
                  Done
                </button>
                <button
                  type="button"
                  onClick={cancelListening}
                  style={{
                    padding: "10px 16px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.2)",
                    cursor: "pointer", backgroundColor: "transparent", color: "#94a3b8",
                    fontSize: 13, fontWeight: 500,
                  }}
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={startListening}
                disabled={disabled}
                style={{
                  padding: "10px 24px", borderRadius: 8, border: "none", cursor: "pointer",
                  backgroundColor: "#0d9488", color: "white", fontSize: 14, fontWeight: 700,
                  display: "flex", alignItems: "center", gap: 6,
                }}
              >
                <Mic style={{ height: 14, width: 14 }} />
                Start
              </button>
            )}
          </div>
        </div>

        {error && <p style={{ fontSize: 11, color: "#f87171", marginTop: 6 }}>{error}</p>}

        {/* Keyframes for ping animation */}
        <style>{`@keyframes ping { 75%, 100% { transform: scale(2); opacity: 0; } }`}</style>
      </div>
    );
  }

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

  // Modal variant — minimal click-target button matching the inline variant
  // (so the QuoteWorkspace opacity-0 wrapper continues to work as a click-
  // through). When dictating, a full-screen modal overlay is rendered via a
  // React portal to document.body so it escapes the parent's opacity-0
  // wrapper. The wrapper makes the inline button invisible to keep the
  // existing "Dictate / Listening…" text label as the sole visible affordance.
  if (variant === "modal") {
    const elapsedM = Math.floor(elapsedSeconds / 60);
    const elapsedS = (elapsedSeconds % 60).toString().padStart(2, "0");
    const elapsedLabel = `${elapsedM}:${elapsedS}`;

    return (
      <>
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

        {isListening && typeof document !== "undefined" && createPortal(
          <div
            // Backdrop. Fixed-position relative to viewport. Click-through
            // is intentionally NOT bound to cancel — we don't want a fumbled
            // tap mid-dictation to discard captured speech. ESC and the
            // explicit Cancel button are the only ways out.
            style={{
              position: "fixed",
              inset: 0,
              backgroundColor: "rgba(15, 23, 42, 0.55)",
              zIndex: 9999,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "1rem",
            }}
            role="dialog"
            aria-modal="true"
            aria-label="Voice dictation"
          >
            <div
              style={{
                backgroundColor: "white",
                borderRadius: 12,
                width: "100%",
                maxWidth: 520,
                padding: "20px 22px",
                boxShadow: "0 20px 60px rgba(15,23,42,0.35)",
                fontFamily: "Inter, system-ui, sans-serif",
              }}
            >
              {/* Header — recording indicator + elapsed time */}
              <div style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 14,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ position: "relative", display: "inline-flex", height: 10, width: 10 }}>
                    <span style={{
                      position: "absolute",
                      display: "inline-flex",
                      height: "100%",
                      width: "100%",
                      borderRadius: "50%",
                      backgroundColor: "#ef4444",
                      opacity: 0.6,
                      animation: "ping 1.5s cubic-bezier(0,0,0.2,1) infinite",
                    }} />
                    <span style={{
                      position: "relative",
                      display: "inline-flex",
                      height: 10,
                      width: 10,
                      borderRadius: "50%",
                      backgroundColor: "#ef4444",
                    }} />
                  </span>
                  <span style={{ fontSize: 14, fontWeight: 500, color: "#1a2b4a" }}>
                    Dictating job notes
                  </span>
                </div>
                <span style={{
                  fontSize: 12,
                  color: "#64748b",
                  fontVariantNumeric: "tabular-nums",
                }}>
                  {elapsedLabel}
                </span>
              </div>

              {/* Transcript area — big, readable, scrolls when speech runs long */}
              <div style={{
                backgroundColor: "#f8fafc",
                borderRadius: 8,
                padding: "16px 18px",
                minHeight: 140,
                maxHeight: 320,
                overflowY: "auto",
                marginBottom: 14,
                border: commandLabel ? "1.5px solid #0d9488" : "1px solid #e2e8f0",
              }}>
                {commandLabel && (
                  <div style={{
                    fontSize: 11,
                    fontWeight: 600,
                    marginBottom: 8,
                    color: liveCommand?.type === "remove" ? "#b45309"
                      : (liveCommand?.type === "build" || liveCommand?.type === "build_with_text") ? "#065f46"
                      : "#1e40af",
                    letterSpacing: "0.02em",
                  }}>
                    {liveCommand?.type === "remove" && "⏪ "}
                    {(liveCommand?.type === "build" || liveCommand?.type === "build_with_text") && "⚡ "}
                    {liveCommand?.type === "change" && "✏️ "}
                    {commandLabel}
                  </div>
                )}
                <p style={{
                  fontSize: 17,
                  lineHeight: 1.5,
                  margin: 0,
                  color: displayText ? "#1a2b4a" : "#94a3b8",
                  wordBreak: "break-word",
                  fontStyle: displayText ? "normal" : "italic",
                }}>
                  {transcript}
                  {interimText && (
                    <span style={{ color: "#94a3b8" }}>
                      {transcript ? " " : ""}{interimText}
                    </span>
                  )}
                  {!displayText && (
                    <>
                      Speak now — describe the job, materials, labour, pricing…
                    </>
                  )}
                  {/* Blinking cursor */}
                  <span style={{
                    display: "inline-block",
                    width: 2,
                    height: 18,
                    backgroundColor: "#94a3b8",
                    marginLeft: 3,
                    verticalAlign: "middle",
                    animation: "dictateCursor 1s steps(2) infinite",
                  }} />
                </p>
              </div>

              {/* Hints row — voice command reminder, only visible while idle in transcript */}
              {!displayText && (
                <p style={{
                  fontSize: 11,
                  color: "#94a3b8",
                  margin: "0 0 14px",
                  lineHeight: 1.5,
                }}>
                  Say "remove that" to undo · "change that to…" to edit · "build the quote" when ready
                </p>
              )}

              {/* Footer — Cancel + Done */}
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button
                  type="button"
                  onClick={cancelListening}
                  style={{
                    padding: "8px 16px",
                    borderRadius: 8,
                    border: "1px solid #e2e8f0",
                    background: "transparent",
                    color: "#64748b",
                    fontSize: 13,
                    fontWeight: 500,
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={stopListening}
                  style={{
                    padding: "8px 20px",
                    borderRadius: 8,
                    border: "none",
                    backgroundColor: "#ef4444",
                    color: "white",
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <Square style={{ height: 14, width: 14 }} />
                  Done
                </button>
              </div>
            </div>

            {/* Keyframes for cursor + ping. Scoped via a unique animation
                name so they don't collide with the floating variant's
                ping keyframe declared elsewhere in the file. */}
            <style>{`
              @keyframes dictateCursor { 50% { opacity: 0; } }
              @keyframes ping { 75%, 100% { transform: scale(2); opacity: 0; } }
            `}</style>
          </div>,
          document.body
        )}
      </>
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
