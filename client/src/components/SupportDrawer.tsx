/**
 * SupportDrawer — Phase 4B Delivery E.13.
 *
 * Right-side Sheet (shadcn) that houses the support chat. Uses the
 * existing AIChatBox primitive for the message list + input. Around
 * it, this drawer:
 *
 *   - Starts a thread on first open of a session and persists the
 *     threadId in component state. Re-opening the drawer in the same
 *     page session resumes the thread; navigating to a new page
 *     starts a fresh one (intentional — keeps threads page-scoped so
 *     transcripts in the back-office show what page the user was on).
 *
 *   - Fires support.sendMessage on each user submit; appends both the
 *     user echo and the assistant reply to the local list. Disables
 *     input while the call is in flight.
 *
 *   - Per assistant message: a row of small actions — "This helped"
 *     thumbs-up and "Email support" link. Clicking the email link
 *     opens the SupportEscalationModal pre-filled from the prefill
 *     endpoint.
 *
 *   - Footer shows remaining-today counter when low (≤ 3 left).
 */

import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Loader2, Send, Sparkles, ThumbsUp, Mail, Check } from "lucide-react";
import { Streamdown } from "streamdown";
import { brand } from "@/lib/brandTheme";
import { trpc } from "@/lib/trpc";
import SupportEscalationModal from "./SupportEscalationModal";

const SUGGESTED_PROMPTS = [
  "How do I upload my brochure?",
  "Why is my generated quote missing line items?",
  "What does the Profit column mean?",
  "How do I tailor my starter catalogue?",
];

type LocalMessage = {
  id: number; // server id once persisted; -1 for the optimistic user echo
  role: "user" | "assistant";
  content: string;
  helpful?: boolean | null;
};

export default function SupportDrawer({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [location] = useLocation();
  const utils = trpc.useUtils();

  const [threadId, setThreadId] = useState<number | null>(null);
  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remainingToday, setRemainingToday] = useState<number | null>(null);
  const [escalateOpen, setEscalateOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const startThreadMut = trpc.support.startThread.useMutation();
  const sendMessageMut = trpc.support.sendMessage.useMutation();
  const markHelpfulMut = trpc.support.markHelpful.useMutation();

  // Start a thread on first open of this drawer instance. Persist the
  // id in component state for the lifetime of the drawer (closing
  // and re-opening keeps the same thread; a hard nav resets it).
  useEffect(() => {
    if (!open || threadId !== null) return;
    let cancelled = false;
    startThreadMut.mutate(
      { startPagePath: location || undefined },
      {
        onSuccess: (data) => {
          if (cancelled) return;
          setThreadId(data.threadId);
        },
        onError: (err) => {
          if (cancelled) return;
          setError(err.message || "Couldn't start the support session.");
        },
      },
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (!scrollRef.current) return;
    const viewport = scrollRef.current.querySelector(
      "[data-radix-scroll-area-viewport]",
    ) as HTMLDivElement | null;
    if (viewport) {
      requestAnimationFrame(() => {
        viewport.scrollTo({ top: viewport.scrollHeight, behavior: "smooth" });
      });
    }
  }, [messages, sending]);

  const handleSend = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || sending || !threadId) return;
    setError(null);

    // Optimistic user echo
    const optimistic: LocalMessage = { id: -1 - messages.length, role: "user", content: trimmed };
    setMessages((prev) => [...prev, optimistic]);
    setInput("");
    setSending(true);

    try {
      const res = await sendMessageMut.mutateAsync({
        threadId,
        message: trimmed,
        currentPagePath: location || undefined,
      });
      const m = res.message;
      setMessages((prev) => [
        ...prev,
        {
          id: m.id,
          role: "assistant",
          content: m.content,
          helpful: m.helpful,
        },
      ]);
      if (typeof res.remainingToday === "number") {
        setRemainingToday(res.remainingToday);
      }
    } catch (err: any) {
      setError(err?.message || "Something went wrong.");
    } finally {
      setSending(false);
    }
  };

  const handleHelpful = (messageId: number) => {
    if (messageId < 0) return; // optimistic, not yet persisted
    setMessages((prev) =>
      prev.map((m) => (m.id === messageId ? { ...m, helpful: true } : m)),
    );
    markHelpfulMut.mutate(
      { messageId, helpful: true },
      {
        onError: () => {
          // revert on failure
          setMessages((prev) =>
            prev.map((m) => (m.id === messageId ? { ...m, helpful: null } : m)),
          );
        },
      },
    );
  };

  const handleEscalateRequested = () => {
    setEscalateOpen(true);
  };

  const handleEscalateComplete = () => {
    setEscalateOpen(false);
    // Visual confirmation in the chat
    setMessages((prev) => [
      ...prev,
      {
        id: -999 - prev.length,
        role: "assistant",
        content:
          "Got it — I've sent your details to the team. We'll come back to you over email.",
      },
    ]);
    // Refresh remaining cap counter on next message
    utils.support.invalidate();
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          className="flex flex-col p-0 sm:max-w-md"
          style={{ width: "100%" }}
        >
          {/* Header */}
          <SheetHeader
            className="border-b px-5 py-4"
            style={{ borderColor: brand.border, background: brand.white }}
          >
            <SheetTitle
              className="flex items-center gap-2"
              style={{ color: brand.navy, fontSize: 16 }}
            >
              <Sparkles size={18} style={{ color: brand.teal }} />
              Help
            </SheetTitle>
            <SheetDescription style={{ fontSize: 13, color: brand.navyMuted }}>
              Ask anything about IdoYourQuotes. If we can&rsquo;t solve it, we&rsquo;ll send your
              question to the team.
            </SheetDescription>
          </SheetHeader>

          {/* Body — message list */}
          <div className="flex-1 overflow-hidden" ref={scrollRef}>
            {messages.length === 0 ? (
              <EmptyState
                onPick={(q) => handleSend(q)}
                disabled={!threadId || sending}
              />
            ) : (
              <ScrollArea className="h-full">
                <div className="flex flex-col gap-4 px-5 py-4">
                  {messages.map((m) => (
                    <MessageRow
                      key={m.id}
                      msg={m}
                      onHelpful={() => handleHelpful(m.id)}
                      onEscalate={handleEscalateRequested}
                    />
                  ))}
                  {sending && (
                    <div
                      className="flex items-center gap-2 text-sm"
                      style={{ color: brand.navyMuted }}
                    >
                      <Loader2 size={14} className="animate-spin" />
                      Thinking…
                    </div>
                  )}
                </div>
              </ScrollArea>
            )}
          </div>

          {/* Error / cap info */}
          {error && (
            <div
              className="px-5 py-2 text-xs"
              style={{ color: "#b91c1c", background: "#fef2f2", borderTop: `1px solid #fecaca` }}
            >
              {error}
            </div>
          )}
          {remainingToday !== null && remainingToday <= 3 && (
            <div
              className="px-5 py-2 text-xs"
              style={{ color: brand.navyMuted, background: brand.tealBg }}
            >
              {remainingToday === 0
                ? "You've reached today's support limit. Use Email support to message the team directly."
                : `${remainingToday} message${remainingToday === 1 ? "" : "s"} left today on your plan.`}
            </div>
          )}

          {/* Composer */}
          <div
            className="border-t p-3"
            style={{ borderColor: brand.border, background: brand.white }}
          >
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSend(input);
              }}
              className="flex items-end gap-2"
            >
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend(input);
                  }
                }}
                placeholder={
                  threadId
                    ? "Type your question…"
                    : "Connecting…"
                }
                disabled={!threadId || sending || (remainingToday !== null && remainingToday <= 0)}
                className="resize-none"
                rows={2}
                style={{ fontSize: 13 }}
              />
              <Button
                type="submit"
                size="sm"
                disabled={
                  !threadId ||
                  sending ||
                  !input.trim() ||
                  (remainingToday !== null && remainingToday <= 0)
                }
                style={{ background: brand.teal, color: "#fff", border: "none" }}
              >
                {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              </Button>
            </form>
            <div
              className="mt-2 flex items-center justify-between"
              style={{ fontSize: 11, color: brand.navyMuted }}
            >
              <button
                type="button"
                onClick={handleEscalateRequested}
                disabled={!threadId}
                className="flex items-center gap-1 underline-offset-2 hover:underline disabled:opacity-50"
                style={{ color: brand.teal, background: "none", border: "none", cursor: "pointer" }}
              >
                <Mail size={11} />
                Email support directly
              </button>
              <span>Press Enter to send</span>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <SupportEscalationModal
        open={escalateOpen}
        threadId={threadId}
        onOpenChange={setEscalateOpen}
        onComplete={handleEscalateComplete}
      />
    </>
  );
}

// ─── Subcomponents ────────────────────────────────────────────────

function EmptyState({
  onPick,
  disabled,
}: {
  onPick: (q: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 px-6 py-8 text-center">
      <Sparkles size={36} style={{ color: brand.teal, opacity: 0.6 }} />
      <div>
        <div style={{ color: brand.navy, fontSize: 14, fontWeight: 500, marginBottom: 4 }}>
          What can I help with?
        </div>
        <div style={{ color: brand.navyMuted, fontSize: 12 }}>
          Pick a question below or type your own.
        </div>
      </div>
      <div className="flex w-full flex-col gap-2">
        {SUGGESTED_PROMPTS.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => onPick(q)}
            disabled={disabled}
            className="text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            style={{
              padding: "10px 14px",
              borderRadius: 8,
              border: `1px solid ${brand.border}`,
              background: brand.white,
              color: brand.navy,
              fontSize: 13,
              cursor: "pointer",
            }}
            onMouseEnter={(e) => {
              if (!disabled) {
                (e.currentTarget as HTMLButtonElement).style.background = brand.tealBg;
                (e.currentTarget as HTMLButtonElement).style.borderColor = brand.tealBorder;
              }
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = brand.white;
              (e.currentTarget as HTMLButtonElement).style.borderColor = brand.border;
            }}
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}

function MessageRow({
  msg,
  onHelpful,
  onEscalate,
}: {
  msg: LocalMessage;
  onHelpful: () => void;
  onEscalate: () => void;
}) {
  const isUser = msg.role === "user";

  return (
    <div className="flex flex-col gap-1.5">
      <div
        className="rounded-lg px-3.5 py-2.5"
        style={{
          background: isUser ? brand.tealBg : brand.white,
          border: `1px solid ${isUser ? brand.tealBorder : brand.border}`,
          color: brand.navy,
          fontSize: 13,
          alignSelf: isUser ? "flex-end" : "flex-start",
          maxWidth: "92%",
        }}
      >
        {isUser ? (
          <div style={{ whiteSpace: "pre-wrap" }}>{msg.content}</div>
        ) : (
          <div className="prose prose-sm max-w-none" style={{ fontSize: 13, lineHeight: 1.5 }}>
            <Streamdown>{msg.content}</Streamdown>
          </div>
        )}
      </div>
      {!isUser && msg.id > 0 && (
        <div
          className="flex items-center gap-3 pl-1"
          style={{ fontSize: 11, color: brand.navyMuted }}
        >
          <button
            type="button"
            onClick={onHelpful}
            disabled={msg.helpful === true}
            className="flex items-center gap-1 disabled:opacity-100"
            style={{
              background: "none",
              border: "none",
              padding: 0,
              cursor: msg.helpful === true ? "default" : "pointer",
              color: msg.helpful === true ? brand.teal : brand.navyMuted,
            }}
          >
            {msg.helpful === true ? <Check size={11} /> : <ThumbsUp size={11} />}
            {msg.helpful === true ? "Marked helpful" : "This helped"}
          </button>
          <button
            type="button"
            onClick={onEscalate}
            className="flex items-center gap-1"
            style={{
              background: "none",
              border: "none",
              padding: 0,
              cursor: "pointer",
              color: brand.navyMuted,
            }}
          >
            <Mail size={11} />
            Email support
          </button>
        </div>
      )}
    </div>
  );
}
