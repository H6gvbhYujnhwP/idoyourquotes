/**
 * PublicChatWidget — "Quote Assistant"
 *
 * Public-facing chat widget for the marketing site. Mounts on every
 * public route (Home, Features, Pricing, Register, NotFound) — explicitly
 * NOT on /login or any signed-in surface. Mounted once at the App level
 * and conditionally renders based on the current path so it persists
 * across public-page navigation without remounting.
 *
 * Visual identity (deliberately distinct from the teal in-app SupportDrawer):
 *   - Amber/orange gradient — warm, inviting, "talk to a sales-style helper"
 *   - Floating bubble bottom-right, expands to a chat panel (not a sheet)
 *   - Pop-in animation on first appearance
 *
 * Persistence model:
 *   - clientUuid generated via crypto.randomUUID() and stored in
 *     sessionStorage (NOT localStorage — wipes on browser close).
 *   - Per-tab memory only. Open the widget in a new tab → fresh thread.
 *   - Server persists messages keyed by clientUuid so navigation between
 *     public pages doesn't lose conversation context within the same tab.
 *
 * State machine:
 *   - closed → open (chat surface) → escalate-form → submitted (return-to-chat)
 *   - escalate-form is reachable from any chat state via the "Talk to a
 *     human" button. After submit the visitor is returned to the chat with
 *     a confirmation message, and they can keep chatting.
 */

import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { Sparkles, Send, MessageCircle, X, ArrowLeft, Loader2, Mail, CheckCircle2 } from "lucide-react";
import { trpc } from "@/lib/trpc";

// ─── Where the widget appears ─────────────────────────────────────
// Public-page allowlist. Anything else and the widget renders nothing.
const PUBLIC_PATH_PREFIXES = [
  "/",        // Home — exact match handled separately
  "/features",
  "/pricing",
  "/register",
  "/404",
];

function isPublicPath(path: string): boolean {
  // Strip query string for matching.
  const cleanPath = path.split("?")[0];

  // Explicit exclusions — these take precedence over the allowlist.
  // /login is excluded by request; anyone landing there is mid-auth.
  if (cleanPath === "/login") return false;
  if (cleanPath === "/set-password") return false;

  // Exact match on the Home path.
  if (cleanPath === "/") return true;

  // Prefix match on the rest of the allowlist (excluding "/").
  return PUBLIC_PATH_PREFIXES.filter((p) => p !== "/").some((p) =>
    cleanPath === p || cleanPath.startsWith(p + "/"),
  );
}

// ─── Client UUID for this tab ─────────────────────────────────────
// Stored in sessionStorage. Generated once per tab. crypto.randomUUID()
// is available in all evergreen browsers and Node 14+; we don't ship to
// IE11 so we don't need a polyfill.
const CLIENT_UUID_KEY = "idyq.prospect.uuid.v1";

function getOrCreateClientUuid(): string {
  if (typeof window === "undefined") return "";
  try {
    const existing = window.sessionStorage.getItem(CLIENT_UUID_KEY);
    if (existing && existing.length >= 8) return existing;
  } catch {
    // sessionStorage blocked (private mode, embedded iframe, etc.).
    // Fall through to in-memory.
  }
  const fresh = (typeof crypto !== "undefined" && crypto.randomUUID)
    ? crypto.randomUUID()
    : `pf-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  try {
    window.sessionStorage.setItem(CLIENT_UUID_KEY, fresh);
  } catch {
    // ignore
  }
  return fresh;
}

// ─── Component ────────────────────────────────────────────────────

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

type View = "chat" | "escalate" | "escalated";

const SUGGESTED_PROMPTS = [
  "What is IdoYourQuotes?",
  "How much does it cost?",
  "What sectors do you cover?",
  "How does the AI work?",
];

const WELCOME_MESSAGE: Message = {
  id: "welcome",
  role: "assistant",
  content: "Hi there 👋 I'm the Quote Assistant. I can tell you about how IdoYourQuotes works, what it costs, and which sectors we cover. What would you like to know?",
};

export default function PublicChatWidget() {
  const [location] = useLocation();
  const visible = isPublicPath(location);

  const [isOpen, setIsOpen] = useState(false);
  const [view, setView] = useState<View>("chat");
  const [messages, setMessages] = useState<Message[]>([WELCOME_MESSAGE]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [threadReady, setThreadReady] = useState(false);

  // Escalation form state
  const [escName, setEscName] = useState("");
  const [escEmail, setEscEmail] = useState("");
  const [escMessage, setEscMessage] = useState("");
  const [escSubmitting, setEscSubmitting] = useState(false);
  const [escError, setEscError] = useState<string | null>(null);

  const clientUuidRef = useRef<string>("");
  const scrollAnchorRef = useRef<HTMLDivElement | null>(null);

  // Initialise the clientUuid once on mount.
  useEffect(() => {
    clientUuidRef.current = getOrCreateClientUuid();
  }, []);

  // tRPC handles
  const startThread = trpc.prospectBot.startThread.useMutation();
  const sendMessage = trpc.prospectBot.sendMessage.useMutation();
  const escalate = trpc.prospectBot.escalate.useMutation();
  const getThread = trpc.prospectBot.getThread.useQuery(
    { clientUuid: clientUuidRef.current },
    {
      enabled: isOpen && !!clientUuidRef.current && !threadReady,
      refetchOnWindowFocus: false,
    },
  );

  // On first open of the widget, start (or resume) the thread.
  useEffect(() => {
    if (!isOpen) return;
    if (threadReady) return;
    if (!clientUuidRef.current) return;

    // Hydrate from server first if the thread already exists.
    if (getThread.data) {
      const serverMessages = getThread.data.messages.map((m: { id: number; role: string; content: string }) => ({
        id: String(m.id),
        role: m.role as "user" | "assistant",
        content: m.content,
      }));
      if (serverMessages.length > 0) {
        setMessages([WELCOME_MESSAGE, ...serverMessages]);
      }
      // Ensure the thread row exists server-side. startThread is
      // idempotent for an existing clientUuid so this is safe to call
      // even if getThread already returned a threadId.
      startThread.mutate(
        { clientUuid: clientUuidRef.current, startPagePath: location },
        {
          onSuccess: () => setThreadReady(true),
          onError: () => setThreadReady(true), // soft fail — visitor can still chat after retry
        },
      );
    }
  }, [isOpen, getThread.data, threadReady]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-scroll to bottom on new messages.
  useEffect(() => {
    if (scrollAnchorRef.current) {
      scrollAnchorRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, view]);

  // Don't render anything on signed-in / excluded routes.
  if (!visible) return null;

  // ── Handlers ────────────────────────────────────────────────────

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || isSending || !clientUuidRef.current) return;

    const userMsg: Message = {
      id: `u-${Date.now()}`,
      role: "user",
      content: trimmed,
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsSending(true);

    try {
      const result = await sendMessage.mutateAsync({
        clientUuid: clientUuidRef.current,
        message: trimmed,
        currentPagePath: location,
      });
      setMessages((prev) => [
        ...prev,
        { id: `a-${Date.now()}`, role: "assistant", content: result.reply },
      ]);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: "assistant",
          content: "Sorry — something went wrong. Try again in a moment, or click 'Talk to a human' below.",
        },
      ]);
    } finally {
      setIsSending(false);
    }
  };

  const handlePromptClick = (prompt: string) => {
    setInput(prompt);
    // Use setTimeout so the input state has applied before sending.
    setTimeout(() => {
      handleSendWith(prompt);
    }, 0);
  };

  const handleSendWith = async (text: string) => {
    if (!text.trim() || isSending || !clientUuidRef.current) return;

    const userMsg: Message = {
      id: `u-${Date.now()}`,
      role: "user",
      content: text,
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsSending(true);

    try {
      const result = await sendMessage.mutateAsync({
        clientUuid: clientUuidRef.current,
        message: text,
        currentPagePath: location,
      });
      setMessages((prev) => [
        ...prev,
        { id: `a-${Date.now()}`, role: "assistant", content: result.reply },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: "assistant",
          content: "Sorry — something went wrong. Try again in a moment, or click 'Talk to a human' below.",
        },
      ]);
    } finally {
      setIsSending(false);
    }
  };

  const handleEscalate = async () => {
    setEscError(null);
    const name = escName.trim();
    const email = escEmail.trim();
    const message = escMessage.trim();
    if (!name) {
      setEscError("Please enter your name.");
      return;
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEscError("Please enter a valid email address.");
      return;
    }
    if (!message) {
      setEscError("Please tell us what you'd like to ask.");
      return;
    }

    setEscSubmitting(true);
    try {
      await escalate.mutateAsync({
        clientUuid: clientUuidRef.current,
        name,
        email,
        message,
      });
      setView("escalated");
    } catch (err: any) {
      setEscError("Couldn't send your message right now — please try again, or email support@mail.idoyourquotes.com directly.");
    } finally {
      setEscSubmitting(false);
    }
  };

  // ── Styles ──────────────────────────────────────────────────────

  const amberGradient = "linear-gradient(135deg, #f59e0b 0%, #f97316 100%)";
  const amberSoft = "#fffbeb";
  const amberAccent = "#f59e0b";

  // ── Render ──────────────────────────────────────────────────────

  return (
    <>
      {/* ── Floating launcher bubble ─────────────────────────────── */}
      {!isOpen && (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          aria-label="Open Quote Assistant"
          title="Chat with the Quote Assistant"
          style={{
            position: "fixed",
            right: 24,
            bottom: 24,
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "12px 18px 12px 14px",
            borderRadius: 9999,
            background: amberGradient,
            color: "#ffffff",
            border: "none",
            cursor: "pointer",
            boxShadow: "0 10px 32px rgba(245, 158, 11, 0.45)",
            fontWeight: 600,
            fontSize: 14,
            zIndex: 60,
            transition: "transform 200ms ease, box-shadow 200ms ease",
            animation: "idyqProspectPulse 2.4s ease-in-out infinite",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.transform = "scale(1.05) translateY(-2px)";
            (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 14px 38px rgba(245, 158, 11, 0.55)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)";
            (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 10px 32px rgba(245, 158, 11, 0.45)";
          }}
        >
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: "50%",
              background: "rgba(255,255,255,0.22)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Sparkles size={18} />
          </div>
          <span>Quote Assistant</span>
        </button>
      )}

      {/* ── Chat panel ───────────────────────────────────────────── */}
      {isOpen && (
        <div
          style={{
            position: "fixed",
            right: 24,
            bottom: 24,
            width: "min(380px, calc(100vw - 32px))",
            height: "min(620px, calc(100vh - 48px))",
            background: "#ffffff",
            borderRadius: 20,
            boxShadow: "0 24px 64px rgba(15, 23, 42, 0.24)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            zIndex: 60,
            border: "1px solid #f1f5f9",
            animation: "idyqProspectSlide 240ms cubic-bezier(0.16, 1, 0.3, 1)",
          }}
        >
          {/* Header */}
          <div
            style={{
              background: amberGradient,
              padding: "16px 18px",
              color: "#ffffff",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {view === "escalate" && (
                <button
                  type="button"
                  onClick={() => {
                    setView("chat");
                    setEscError(null);
                  }}
                  aria-label="Back to chat"
                  style={{
                    background: "rgba(255,255,255,0.18)",
                    border: "none",
                    color: "#ffffff",
                    width: 32,
                    height: 32,
                    borderRadius: 9999,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                  }}
                >
                  <ArrowLeft size={16} />
                </button>
              )}
              {view !== "escalate" && (
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 9999,
                    background: "rgba(255,255,255,0.22)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Sparkles size={18} />
                </div>
              )}
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, lineHeight: 1.2 }}>
                  {view === "escalate" ? "Talk to a human" : "Quote Assistant"}
                </div>
                <div style={{ fontSize: 11, opacity: 0.85, lineHeight: 1.2, marginTop: 2 }}>
                  {view === "escalate" ? "We'll email you back" : "AI-powered • Replies in seconds"}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              aria-label="Close chat"
              style={{
                background: "rgba(255,255,255,0.18)",
                border: "none",
                color: "#ffffff",
                width: 32,
                height: 32,
                borderRadius: 9999,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
              }}
            >
              <X size={16} />
            </button>
          </div>

          {/* Body */}
          <div style={{ flex: 1, overflowY: "auto", background: "#fafafa" }}>
            {view === "chat" && (
              <div style={{ padding: "16px 16px 8px" }}>
                {messages.map((m) => (
                  <ChatBubble key={m.id} role={m.role} content={m.content} amberAccent={amberAccent} amberSoft={amberSoft} />
                ))}
                {isSending && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", marginBottom: 12, color: "#94a3b8", fontSize: 13 }}>
                    <Loader2 size={14} className="animate-spin" />
                    <span>Thinking…</span>
                  </div>
                )}
                {messages.length <= 1 && !isSending && (
                  <div style={{ marginTop: 4 }}>
                    <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 8, paddingLeft: 4 }}>
                      Try one of these
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {SUGGESTED_PROMPTS.map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => handlePromptClick(p)}
                          disabled={isSending}
                          style={{
                            textAlign: "left",
                            background: "#ffffff",
                            border: "1px solid #fde68a",
                            color: "#7c2d12",
                            padding: "8px 12px",
                            borderRadius: 10,
                            fontSize: 13,
                            cursor: "pointer",
                            transition: "background 150ms ease, transform 150ms ease",
                          }}
                          onMouseEnter={(e) => {
                            (e.currentTarget as HTMLButtonElement).style.background = amberSoft;
                          }}
                          onMouseLeave={(e) => {
                            (e.currentTarget as HTMLButtonElement).style.background = "#ffffff";
                          }}
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div ref={scrollAnchorRef} />
              </div>
            )}

            {view === "escalate" && (
              <div style={{ padding: 18 }}>
                <p style={{ fontSize: 13, color: "#475569", marginBottom: 14, lineHeight: 1.5 }}>
                  Leave your details and one of the team will email you back. We won't share your email — promise.
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: "#1a2b4a", display: "block", marginBottom: 4 }}>
                      Your name
                    </label>
                    <input
                      type="text"
                      value={escName}
                      onChange={(e) => setEscName(e.target.value)}
                      placeholder="Wez"
                      style={{
                        width: "100%",
                        padding: "10px 12px",
                        fontSize: 14,
                        border: "1px solid #e2e8f0",
                        borderRadius: 8,
                        outline: "none",
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: "#1a2b4a", display: "block", marginBottom: 4 }}>
                      Email
                    </label>
                    <input
                      type="email"
                      value={escEmail}
                      onChange={(e) => setEscEmail(e.target.value)}
                      placeholder="you@example.co.uk"
                      style={{
                        width: "100%",
                        padding: "10px 12px",
                        fontSize: 14,
                        border: "1px solid #e2e8f0",
                        borderRadius: 8,
                        outline: "none",
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: "#1a2b4a", display: "block", marginBottom: 4 }}>
                      What would you like to ask?
                    </label>
                    <textarea
                      value={escMessage}
                      onChange={(e) => setEscMessage(e.target.value)}
                      placeholder="Briefly tell us what you'd like to know — pricing, custom setup, integrations, anything…"
                      rows={4}
                      style={{
                        width: "100%",
                        padding: "10px 12px",
                        fontSize: 14,
                        border: "1px solid #e2e8f0",
                        borderRadius: 8,
                        outline: "none",
                        resize: "vertical",
                        fontFamily: "inherit",
                      }}
                    />
                  </div>
                  {escError && (
                    <div style={{ fontSize: 12, color: "#b91c1c", padding: "8px 10px", background: "#fef2f2", borderRadius: 6 }}>
                      {escError}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={handleEscalate}
                    disabled={escSubmitting}
                    style={{
                      width: "100%",
                      padding: "12px 16px",
                      background: amberGradient,
                      color: "#ffffff",
                      border: "none",
                      borderRadius: 10,
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: escSubmitting ? "wait" : "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 8,
                      opacity: escSubmitting ? 0.7 : 1,
                    }}
                  >
                    {escSubmitting ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        Sending…
                      </>
                    ) : (
                      <>
                        <Mail size={16} />
                        Send to the team
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {view === "escalated" && (
              <div style={{ padding: 24, textAlign: "center" }}>
                <div
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 9999,
                    background: "#dcfce7",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    margin: "0 auto 16px",
                  }}
                >
                  <CheckCircle2 size={28} style={{ color: "#16a34a" }} />
                </div>
                <h3 style={{ fontSize: 17, fontWeight: 700, color: "#1a2b4a", margin: "0 0 8px" }}>
                  Message sent — thanks!
                </h3>
                <p style={{ fontSize: 13, color: "#475569", lineHeight: 1.55, marginBottom: 20 }}>
                  We've passed your question to the team. Expect a reply within one working day. Want to keep chatting in the meantime?
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setView("chat");
                    setEscName("");
                    setEscEmail("");
                    setEscMessage("");
                  }}
                  style={{
                    padding: "10px 18px",
                    background: "#ffffff",
                    color: amberAccent,
                    border: `1px solid ${amberAccent}`,
                    borderRadius: 10,
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Back to chat
                </button>
              </div>
            )}
          </div>

          {/* Footer (chat view only) */}
          {view === "chat" && (
            <div
              style={{
                borderTop: "1px solid #f1f5f9",
                background: "#ffffff",
                padding: "10px 12px",
              }}
            >
              <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder="Ask anything…"
                  rows={1}
                  disabled={isSending}
                  style={{
                    flex: 1,
                    padding: "9px 12px",
                    fontSize: 14,
                    border: "1px solid #e2e8f0",
                    borderRadius: 10,
                    outline: "none",
                    resize: "none",
                    fontFamily: "inherit",
                    maxHeight: 80,
                  }}
                />
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={isSending || !input.trim()}
                  aria-label="Send message"
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 10,
                    background: input.trim() && !isSending ? amberGradient : "#e2e8f0",
                    color: "#ffffff",
                    border: "none",
                    cursor: input.trim() && !isSending ? "pointer" : "not-allowed",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <Send size={16} />
                </button>
              </div>
              <button
                type="button"
                onClick={() => {
                  setView("escalate");
                  setEscError(null);
                }}
                style={{
                  marginTop: 8,
                  width: "100%",
                  background: "transparent",
                  border: "none",
                  color: amberAccent,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                  padding: "6px 0",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                }}
              >
                <MessageCircle size={13} />
                Talk to a human
              </button>
            </div>
          )}
        </div>
      )}

      {/* Inline keyframes — scoped via the animation name so they don't leak. */}
      <style>{`
        @keyframes idyqProspectPulse {
          0%, 100% { box-shadow: 0 10px 32px rgba(245, 158, 11, 0.45); }
          50% { box-shadow: 0 12px 40px rgba(245, 158, 11, 0.65); }
        }
        @keyframes idyqProspectSlide {
          from { opacity: 0; transform: translateY(20px) scale(0.96); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </>
  );
}

// ─── Chat bubble ───────────────────────────────────────────────────

function ChatBubble({
  role,
  content,
  amberAccent,
  amberSoft,
}: {
  role: "user" | "assistant";
  content: string;
  amberAccent: string;
  amberSoft: string;
}) {
  const isUser = role === "user";
  return (
    <div
      style={{
        display: "flex",
        justifyContent: isUser ? "flex-end" : "flex-start",
        marginBottom: 10,
      }}
    >
      <div
        style={{
          maxWidth: "85%",
          padding: "9px 12px",
          borderRadius: isUser ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
          background: isUser ? amberAccent : "#ffffff",
          color: isUser ? "#ffffff" : "#1a2b4a",
          fontSize: 13.5,
          lineHeight: 1.5,
          border: isUser ? "none" : "1px solid #f1f5f9",
          boxShadow: isUser ? "none" : "0 1px 3px rgba(15,23,42,0.04)",
          whiteSpace: "pre-wrap",
          wordWrap: "break-word",
        }}
      >
        {content}
      </div>
    </div>
  );
}
