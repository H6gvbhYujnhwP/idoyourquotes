/**
 * Support tRPC sub-router — Phase 4B Delivery E.13.
 *
 * Endpoints:
 *   - support.startThread     create a new thread, return its id
 *   - support.getThread       fetch a thread + its messages (resume)
 *   - support.sendMessage     send a user message, get the bot reply
 *   - support.markHelpful     thumbs-up a specific assistant message
 *   - support.escalate        capture contact form, send email, mark
 *                             thread escalated
 *   - support.prefillContact  return the user/org-derived defaults for
 *                             the escalation form
 *
 * Daily message cap (per user, per UTC day) — enforced inside
 * sendMessage to protect the AI bill at marketing launch:
 *   trial: 10   solo: 20   pro: 50   team: 100
 *
 * All endpoints are protectedProcedure — anonymous users have no
 * access to this surface. The drawer is only mounted on signed-in
 * pages (it lives inside DashboardLayout).
 *
 * Wired into the main router at server/routers.ts as `support`.
 */

import { z } from "zod";
import { and, asc, desc, eq, gte, sql } from "drizzle-orm";
import { router, protectedProcedure } from "../_core/trpc";
import { invokeLLM } from "../_core/llm";
import {
  getDb,
  getUserPrimaryOrg,
  getUserById,
  logUsage,
} from "../db";
import {
  supportThreads,
  supportMessages,
  type SupportMessage,
} from "../../shared/schema";
import { SUPPORT_KNOWLEDGE } from "./supportKnowledge";
import { sendEscalationEmail, isSmtpConfigured } from "./smtpMailer";

// ─── Daily cap per tier ───────────────────────────────────────────

const DAILY_CAP_BY_TIER: Record<string, number> = {
  trial: 10,
  solo: 20,
  pro: 50,
  team: 100,
};

function dailyCapFor(tier: string | undefined): number {
  if (!tier) return 10;
  return DAILY_CAP_BY_TIER[tier] ?? 10;
}

// ─── Helpers ──────────────────────────────────────────────────────

/**
 * Count assistant messages this user has triggered today (UTC). Used
 * to enforce the daily cap. We count assistant rows rather than user
 * rows so a user can keep typing if a previous assistant turn errored
 * out without consuming their cap.
 */
async function getTodayMessageCount(userId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);

  // Join via support_threads to keep the count to this user only.
  const rows = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(supportMessages)
    .innerJoin(supportThreads, eq(supportMessages.threadId, supportThreads.id))
    .where(
      and(
        eq(supportThreads.userId, userId),
        eq(supportMessages.role, "assistant"),
        gte(supportMessages.createdAt, startOfDay),
      ),
    );

  return rows[0]?.count ?? 0;
}

/**
 * Build the per-turn system prompt: the curated knowledge plus
 * lightweight per-user metadata. Never includes other tenants' data.
 */
function buildSystemPrompt(args: {
  tier: string;
  sector: string | null;
  startPagePath: string | null;
  currentPagePath: string | null;
  hasBrochure: boolean;
}): string {
  const meta = `
---

## About this user

- Plan: ${args.tier}
- Sector: ${args.sector || "(not set)"}
- Brochure uploaded: ${args.hasBrochure ? "yes" : "no"}
- Started conversation on: ${args.startPagePath || "(unknown)"}
- Currently on: ${args.currentPagePath || args.startPagePath || "(unknown)"}

When answering, take the plan into account: if a feature is not on this user's plan, say so and point at the upgrade path. If the feature applies and they're on the right plan, walk them through it.
`;

  return SUPPORT_KNOWLEDGE + meta;
}

/**
 * Run the bot turn — assemble the message history, call the LLM, log
 * usage, return the assistant text + token counts. Caps reply at ~600
 * tokens (single biggest cost lever).
 */
async function runBotTurn(args: {
  systemPrompt: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  newUserMessage: string;
}): Promise<{ content: string; inputTokens: number; outputTokens: number }> {
  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    { role: "system", content: args.systemPrompt },
    ...args.history,
    { role: "user", content: args.newUserMessage },
  ];

  const response = await invokeLLM({
    messages,
    temperature: 0.2, // a touch warmer than the 0.1 default — friendlier replies, still deterministic
    max_tokens: 600,
  });

  const choice = response.choices[0];
  const raw = choice?.message?.content;
  const content =
    typeof raw === "string"
      ? raw
      : Array.isArray(raw)
        ? raw.map((c: any) => (c?.type === "text" ? c.text : "")).join("")
        : "";

  // The OpenAI-compatible response shape exposes usage at the top
  // level on real responses. invokeLLM doesn't strongly type this so
  // we cast and default to 0 if absent.
  const usage = (response as any).usage as
    | { prompt_tokens?: number; completion_tokens?: number }
    | undefined;

  return {
    content: content || "I'm not sure how to answer that — want me to send it to the team?",
    inputTokens: usage?.prompt_tokens ?? 0,
    outputTokens: usage?.completion_tokens ?? 0,
  };
}

// ─── Router ───────────────────────────────────────────────────────

export const supportRouter = router({
  /**
   * Create a new thread. Idempotent in spirit but not in storage —
   * each call inserts a row. Workspace is expected to call this once
   * per drawer-session.
   */
  startThread: protectedProcedure
    .input(
      z.object({
        startPagePath: z.string().max(500).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");

      const org = await getUserPrimaryOrg(ctx.user.id);
      if (!org) throw new Error("No organisation found");

      const [thread] = await db
        .insert(supportThreads)
        .values({
          orgId: org.id,
          userId: ctx.user.id,
          status: "open",
          startPagePath: input.startPagePath ?? null,
          lastPagePath: input.startPagePath ?? null,
        })
        .returning();

      return { threadId: thread.id };
    }),

  /**
   * Fetch a thread by id along with its messages. Org-scoped — a user
   * can only read their own org's threads. Used to resume a session
   * if the drawer is closed and re-opened.
   */
  getThread: protectedProcedure
    .input(z.object({ threadId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");

      const org = await getUserPrimaryOrg(ctx.user.id);
      if (!org) throw new Error("No organisation found");

      const [thread] = await db
        .select()
        .from(supportThreads)
        .where(
          and(
            eq(supportThreads.id, input.threadId),
            eq(supportThreads.orgId, org.id),
          ),
        )
        .limit(1);

      if (!thread) throw new Error("Thread not found");

      const messages = await db
        .select()
        .from(supportMessages)
        .where(eq(supportMessages.threadId, thread.id))
        .orderBy(asc(supportMessages.createdAt));

      return { thread, messages };
    }),

  /**
   * Send a user message, get the bot reply. Persists both rows.
   * Enforces the daily cap.
   */
  sendMessage: protectedProcedure
    .input(
      z.object({
        threadId: z.number(),
        message: z.string().min(1).max(4000),
        currentPagePath: z.string().max(500).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");

      const org = await getUserPrimaryOrg(ctx.user.id);
      if (!org) throw new Error("No organisation found");

      // Org-scope check on the thread itself
      const [thread] = await db
        .select()
        .from(supportThreads)
        .where(
          and(
            eq(supportThreads.id, input.threadId),
            eq(supportThreads.orgId, org.id),
          ),
        )
        .limit(1);

      if (!thread) throw new Error("Thread not found");

      // Daily cap
      const todayCount = await getTodayMessageCount(ctx.user.id);
      const cap = dailyCapFor((org as any).subscriptionTier);
      if (todayCount >= cap) {
        throw new Error(
          `You've reached today's support message limit (${cap} for your plan). The bot resets at midnight UTC, or you can email the team directly via the Email support button.`,
        );
      }

      // Persist the user message first
      await db.insert(supportMessages).values({
        threadId: thread.id,
        role: "user",
        content: input.message,
      });

      // Read the recent message history for context — last 20 turns
      // is plenty and bounds the input tokens. Newest sit at the
      // bottom; we slice tail and reverse for chronological order.
      const recent = await db
        .select()
        .from(supportMessages)
        .where(eq(supportMessages.threadId, thread.id))
        .orderBy(desc(supportMessages.createdAt))
        .limit(20);

      // chronological order, oldest first, EXCLUDING the user
      // message we just inserted (it's passed separately as
      // newUserMessage so the prompt structure stays clean).
      const history = recent
        .slice(1) // drop the just-inserted user message
        .reverse()
        .map((m: SupportMessage) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        }));

      // Per-user metadata for the system prompt
      const orgAny = org as any;
      const hasBrochure = !!orgAny.brochureFileKey && !orgAny.brochureDeletedAt;
      const systemPrompt = buildSystemPrompt({
        tier: orgAny.subscriptionTier ?? "trial",
        sector: orgAny.defaultTradeSector ?? null,
        startPagePath: thread.startPagePath,
        currentPagePath: input.currentPagePath ?? thread.lastPagePath ?? null,
        hasBrochure,
      });

      // LLM turn
      let bot;
      try {
        bot = await runBotTurn({
          systemPrompt,
          history,
          newUserMessage: input.message,
        });
      } catch (err) {
        console.error("[support] LLM turn failed:", err);
        // Best-effort fallback message stored as the assistant turn
        bot = {
          content:
            "Sorry — something went wrong on my end. Try again in a moment, or hit Email support to send this to the team directly.",
          inputTokens: 0,
          outputTokens: 0,
        };
      }

      // Persist assistant message
      const [assistantRow] = await db
        .insert(supportMessages)
        .values({
          threadId: thread.id,
          role: "assistant",
          content: bot.content,
          inputTokens: bot.inputTokens,
          outputTokens: bot.outputTokens,
        })
        .returning();

      // Update thread bookkeeping
      await db
        .update(supportThreads)
        .set({
          lastPagePath: input.currentPagePath ?? thread.lastPagePath,
          updatedAt: new Date(),
        })
        .where(eq(supportThreads.id, thread.id));

      // Usage log — 0 credits (support shouldn't compete with the
      // user's quote-generation budget). Logged as actionType
      // 'support_chat' so it shows up in admin alongside other AI
      // activity for cost auditing.
      await logUsage({
        orgId: org.id,
        userId: ctx.user.id,
        actionType: "support_chat",
        creditsUsed: 0,
        metadata: {
          threadId: thread.id,
          inputTokens: bot.inputTokens,
          outputTokens: bot.outputTokens,
        },
      });

      return {
        message: assistantRow,
        remainingToday: Math.max(0, cap - (todayCount + 1)),
      };
    }),

  /**
   * Mark an assistant message helpful. Single-use — once flipped to
   * true it stays true. The reverse direction (un-helpful) is left
   * for a future delivery if we add a thumbs-down.
   */
  markHelpful: protectedProcedure
    .input(z.object({ messageId: z.number(), helpful: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");

      const org = await getUserPrimaryOrg(ctx.user.id);
      if (!org) throw new Error("No organisation found");

      // Verify the message belongs to a thread this org owns
      const [row] = await db
        .select({
          msgId: supportMessages.id,
          threadOrgId: supportThreads.orgId,
        })
        .from(supportMessages)
        .innerJoin(supportThreads, eq(supportMessages.threadId, supportThreads.id))
        .where(eq(supportMessages.id, input.messageId))
        .limit(1);

      if (!row || row.threadOrgId !== org.id) {
        throw new Error("Message not found");
      }

      await db
        .update(supportMessages)
        .set({ helpful: input.helpful })
        .where(eq(supportMessages.id, input.messageId));

      return { ok: true };
    }),

  /**
   * Return prefilled values for the escalation form. Pulls from the
   * user record (name, email) and the org record (companyName, phone)
   * with sensible fallbacks.
   */
  prefillContact: protectedProcedure.query(async ({ ctx }) => {
    const user = await getUserById(ctx.user.id);
    const org = await getUserPrimaryOrg(ctx.user.id);

    const orgAny = (org as any) || {};

    return {
      contactName: (user as any)?.name || "",
      businessName: orgAny.companyName || (user as any)?.companyName || "",
      email: (user as any)?.email || "",
      phone: orgAny.companyPhone || (user as any)?.companyPhone || "",
    };
  }),

  /**
   * Capture the contact form, send the escalation email, mark the
   * thread escalated. Returns whether the email actually went out so
   * the workspace can show "ticket recorded" vs "ticket recorded and
   * email sent".
   */
  escalate: protectedProcedure
    .input(
      z.object({
        threadId: z.number(),
        contactName: z.string().min(1).max(255),
        businessName: z.string().max(255).optional().default(""),
        email: z.string().email(),
        phone: z.string().max(50).optional().default(""),
        summary: z.string().max(500).optional().default(""),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");

      const org = await getUserPrimaryOrg(ctx.user.id);
      if (!org) throw new Error("No organisation found");

      const [thread] = await db
        .select()
        .from(supportThreads)
        .where(
          and(
            eq(supportThreads.id, input.threadId),
            eq(supportThreads.orgId, org.id),
          ),
        )
        .limit(1);
      if (!thread) throw new Error("Thread not found");

      // Persist the contact details + summary on the thread, flip
      // status to escalated. This happens regardless of email
      // success — we want the back-office to show the escalation
      // even if SMTP is misconfigured.
      await db
        .update(supportThreads)
        .set({
          status: "escalated",
          escalationContactName: input.contactName,
          escalationBusinessName: input.businessName,
          escalationEmail: input.email,
          escalationPhone: input.phone,
          summary: input.summary,
          escalatedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(supportThreads.id, thread.id));

      // Build the transcript for the email body
      const messages = await db
        .select()
        .from(supportMessages)
        .where(eq(supportMessages.threadId, thread.id))
        .orderBy(asc(supportMessages.createdAt));

      const { transcriptHtml, transcriptText } = formatTranscript(messages);

      // Account age in days
      const orgAny = org as any;
      const createdAt = orgAny.createdAt ? new Date(orgAny.createdAt) : null;
      const accountAgeDays = createdAt
        ? Math.floor((Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24))
        : 0;

      // Send the email. Returns false if SMTP not configured or send
      // failed — the workspace sees this in the response.
      const emailSent = await sendEscalationEmail({
        contactName: input.contactName,
        businessName: input.businessName,
        email: input.email,
        phone: input.phone,
        summary: input.summary,
        transcriptHtml,
        transcriptText,
        tier: orgAny.subscriptionTier ?? "trial",
        sector: orgAny.defaultTradeSector ?? null,
        startPagePath: thread.startPagePath,
        lastPagePath: thread.lastPagePath,
        threadId: thread.id,
        accountAgeDays,
      });

      // Log usage — escalation is a meaningful event we want
      // visibility on. 0 credits.
      await logUsage({
        orgId: org.id,
        userId: ctx.user.id,
        actionType: "support_escalate",
        creditsUsed: 0,
        metadata: {
          threadId: thread.id,
          emailSent,
          smtpConfigured: isSmtpConfigured(),
        },
      });

      return {
        ok: true,
        emailSent,
        smtpConfigured: isSmtpConfigured(),
      };
    }),
});

// ─── Transcript formatting ────────────────────────────────────────

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatTranscript(messages: SupportMessage[]): {
  transcriptHtml: string;
  transcriptText: string;
} {
  const htmlParts: string[] = [];
  const textParts: string[] = [];

  for (const m of messages) {
    const time = new Date(m.createdAt).toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
    });
    const label = m.role === "user" ? "User" : "Bot";
    const colour = m.role === "user" ? "#1a2b4a" : "#0d9488";

    htmlParts.push(
      `<div style="margin-bottom: 12px;">
        <div style="font-size: 11px; color: #94a3b8; margin-bottom: 4px;"><strong style="color: ${colour};">${label}</strong> · ${time}</div>
        <div style="white-space: pre-wrap;">${escapeHtml(m.content)}</div>
      </div>`,
    );
    textParts.push(`[${time}] ${label}:\n${m.content}\n`);
  }

  return {
    transcriptHtml: htmlParts.join("\n"),
    transcriptText: textParts.join("\n"),
  };
}
