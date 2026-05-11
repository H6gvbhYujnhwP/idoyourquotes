/**
 * SMTP mailer — Google Workspace path for support-escalation emails.
 *
 * Phase 4B Delivery E.13. Kept deliberately separate from the Resend
 * pipeline (server/services/emailService.ts). Resend continues to send
 * verification, welcome, trial, limit, exit-survey, and team-invite
 * emails. This file is *only* for the support escalation path.
 *
 * From: john@mail.idoyourquotes.com (Google Workspace mailbox)
 * To:   support@mail.idoyourquotes.com (alias on the existing John
 *       Workspace user — inbound mail to the alias lands in the same
 *       mailbox without needing a separate £7 seat)
 * Reply-To: the customer's email — so hitting Reply in the inbox goes
 *           straight back to the customer, no copy-paste, no missed
 *           addresses.
 *
 * Required environment variables (set on Render):
 *   SMTP_HOST       smtp.gmail.com
 *   SMTP_PORT       465
 *   SMTP_USER       john@mail.idoyourquotes.com
 *   SMTP_PASS       <Google Workspace app password>
 *   SUPPORT_INBOX   support@idoyourquotes.com  (destination — env-driven
 *                   so we can change without code change)
 *
 * If any of these are missing the function logs and returns false
 * rather than throwing — escalation falls back to the database record
 * (the thread is still marked escalated and stored), but the team
 * doesn't get the email until the env vars land. Surface this in the
 * escalation endpoint's response so the workspace can show "ticket
 * recorded but email failed" if it ever comes up.
 */

import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";

let _transporter: Transporter | null = null;
let _transporterChecked = false;

function getTransporter(): Transporter | null {
  if (_transporterChecked) return _transporter;
  _transporterChecked = true;

  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !port || !user || !pass) {
    console.warn("[SMTP] One or more SMTP env vars missing — escalation emails will not send. Need SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS.");
    return null;
  }

  const portNum = Number.parseInt(port, 10);
  if (Number.isNaN(portNum)) {
    console.warn("[SMTP] SMTP_PORT is not a number:", port);
    return null;
  }

  try {
    _transporter = nodemailer.createTransport({
      host,
      port: portNum,
      // 465 = SSL, 587 = STARTTLS. Google Workspace supports both.
      secure: portNum === 465,
      auth: { user, pass },
    });
    return _transporter;
  } catch (err) {
    console.error("[SMTP] Failed to create transporter:", err);
    return null;
  }
}

export function isSmtpConfigured(): boolean {
  return getTransporter() !== null;
}

// ─── Escalation email ─────────────────────────────────────────────

export type EscalationEmailParams = {
  // Customer-side contact details (captured by the form)
  contactName: string;
  businessName: string;
  email: string;
  phone: string;

  // Bot-drafted summary, used as the subject suffix
  summary: string;

  // Human-readable transcript (formatted by the caller)
  transcriptHtml: string;
  transcriptText: string;

  // Metadata for the bottom block
  tier: string;
  sector: string | null;
  startPagePath: string | null;
  lastPagePath: string | null;
  threadId: number;
  accountAgeDays: number;
};

/**
 * Send the escalation email via SMTP. Returns true on success, false
 * on any failure (env missing, transport error, Google rejection).
 *
 * Tier-prefixed subject so the team's inbox sorts naturally:
 *   [Trial] / [Solo] / [Pro] / [Team — priority] <bot-drafted summary>
 */
export async function sendEscalationEmail(params: EscalationEmailParams): Promise<boolean> {
  const transporter = getTransporter();
  if (!transporter) return false;

  const fromAddress = process.env.SMTP_USER!;
  const supportInbox = process.env.SUPPORT_INBOX || "support@mail.idoyourquotes.com";

  const subject = formatSubject(params.tier, params.summary);

  const html = renderHtml(params);
  const text = renderText(params);

  try {
    const info = await transporter.sendMail({
      from: `"IdoYourQuotes Support Bot" <${fromAddress}>`,
      to: supportInbox,
      replyTo: params.email,
      subject,
      html,
      text,
    });
    console.log(`[SMTP] Escalation email sent for thread ${params.threadId} (messageId=${info.messageId})`);
    return true;
  } catch (err) {
    console.error("[SMTP] Escalation email send failed:", err);
    return false;
  }
}

function formatSubject(tier: string, summary: string): string {
  const tag = (() => {
    switch (tier) {
      case "team": return "[Team — priority]";
      case "pro": return "[Pro]";
      case "solo": return "[Solo]";
      case "trial": return "[Trial]";
      default: return `[${tier}]`;
    }
  })();
  const trimmedSummary = summary.length > 80 ? summary.slice(0, 77) + "…" : summary;
  return `${tag} ${trimmedSummary || "Support request"}`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderHtml(p: EscalationEmailParams): string {
  return `<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 24px; max-width: 720px; margin: 0 auto; color: #1a2b4a;">

  <h2 style="color: #1a2b4a; margin: 0 0 16px;">Support escalation — ${escapeHtml(p.contactName) || "—"}</h2>

  <!-- Contact block — prominent, top of email -->
  <table style="border-collapse: collapse; width: 100%; max-width: 640px; margin-bottom: 24px; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
    <tr style="background: #f8fafc;"><td style="padding: 10px 14px; font-weight: 600; width: 160px; border-bottom: 1px solid #e2e8f0;">Contact name</td><td style="padding: 10px 14px; border-bottom: 1px solid #e2e8f0;">${escapeHtml(p.contactName) || "—"}</td></tr>
    <tr><td style="padding: 10px 14px; font-weight: 600; border-bottom: 1px solid #e2e8f0;">Business</td><td style="padding: 10px 14px; border-bottom: 1px solid #e2e8f0;">${escapeHtml(p.businessName) || "—"}</td></tr>
    <tr style="background: #f8fafc;"><td style="padding: 10px 14px; font-weight: 600; border-bottom: 1px solid #e2e8f0;">Email</td><td style="padding: 10px 14px; border-bottom: 1px solid #e2e8f0;"><a href="mailto:${escapeHtml(p.email)}" style="color: #0d9488;">${escapeHtml(p.email)}</a></td></tr>
    <tr><td style="padding: 10px 14px; font-weight: 600;">Phone</td><td style="padding: 10px 14px;">${escapeHtml(p.phone) || "—"}</td></tr>
  </table>

  <!-- Bot-drafted summary -->
  <h3 style="color: #1a2b4a; margin: 0 0 8px; font-size: 15px;">What it's about</h3>
  <div style="background: #f0fdfa; border-left: 3px solid #0d9488; padding: 12px 16px; margin-bottom: 24px; border-radius: 4px; font-size: 14px;">
    ${escapeHtml(p.summary) || "<em>No summary provided</em>"}
  </div>

  <!-- Transcript -->
  <h3 style="color: #1a2b4a; margin: 0 0 8px; font-size: 15px;">Conversation transcript</h3>
  <div style="border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin-bottom: 24px; font-size: 14px; line-height: 1.5;">
    ${p.transcriptHtml}
  </div>

  <!-- Metadata footer -->
  <h3 style="color: #1a2b4a; margin: 0 0 8px; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px; color: #64748b;">Account context</h3>
  <table style="border-collapse: collapse; width: 100%; max-width: 640px; font-size: 13px; color: #475569;">
    <tr><td style="padding: 4px 0; width: 160px;">Plan</td><td style="padding: 4px 0;">${escapeHtml(p.tier)}</td></tr>
    <tr><td style="padding: 4px 0;">Sector</td><td style="padding: 4px 0;">${escapeHtml(p.sector || "—")}</td></tr>
    <tr><td style="padding: 4px 0;">Account age</td><td style="padding: 4px 0;">${p.accountAgeDays} days</td></tr>
    <tr><td style="padding: 4px 0;">Started on page</td><td style="padding: 4px 0;"><code>${escapeHtml(p.startPagePath || "—")}</code></td></tr>
    <tr><td style="padding: 4px 0;">Last on page</td><td style="padding: 4px 0;"><code>${escapeHtml(p.lastPagePath || "—")}</code></td></tr>
    <tr><td style="padding: 4px 0;">Thread ID</td><td style="padding: 4px 0;">#${p.threadId}</td></tr>
  </table>

  <p style="margin-top: 24px; font-size: 12px; color: #94a3b8;">
    Reply directly to this email to respond to the customer — Reply-To is set to their address.
    Or open the thread in the admin panel to mark it resolved.
  </p>

</body>
</html>`;
}

function renderText(p: EscalationEmailParams): string {
  return `Support escalation — ${p.contactName || "—"}

CONTACT
  Name:     ${p.contactName || "—"}
  Business: ${p.businessName || "—"}
  Email:    ${p.email}
  Phone:    ${p.phone || "—"}

WHAT IT'S ABOUT
${p.summary || "(no summary provided)"}

TRANSCRIPT
${p.transcriptText}

ACCOUNT CONTEXT
  Plan:           ${p.tier}
  Sector:         ${p.sector || "—"}
  Account age:    ${p.accountAgeDays} days
  Started on:     ${p.startPagePath || "—"}
  Last on:        ${p.lastPagePath || "—"}
  Thread ID:      #${p.threadId}

Reply directly to this email to respond to the customer — Reply-To is set to their address.
`;
}

// ─── Prospect escalation email ────────────────────────────────────
//
// Separate from the customer escalation email above because prospects
// have no account, no tier, no sector — they're anonymous visitors. The
// subject is tagged [Prospect] so the team's inbox sorts naturally and
// they can tell at a glance this is a marketing-site enquiry, not a
// support ticket from an existing customer.

export type ProspectEscalationEmailParams = {
  contactName: string;
  email: string;
  summary: string;        // visitor-written "what they want to ask"
  transcriptText: string; // plain-text transcript of the bot chat so far
  startPagePath: string | null;
  lastPagePath: string | null;
  threadId: number;
  ipAddress: string | null;
  userAgent: string | null;
};

export async function sendProspectEscalationEmail(params: ProspectEscalationEmailParams): Promise<boolean> {
  const transporter = getTransporter();
  if (!transporter) return false;

  const fromAddress = process.env.SMTP_USER!;
  const supportInbox = process.env.SUPPORT_INBOX || "support@mail.idoyourquotes.com";

  const trimmedSummary = params.summary.length > 80 ? params.summary.slice(0, 77) + "…" : params.summary;
  const subject = `[Prospect] ${trimmedSummary || "Website enquiry"}`;

  const html = `<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 24px; max-width: 720px; margin: 0 auto; color: #1a2b4a;">

  <div style="background: linear-gradient(135deg, #f59e0b, #f97316); padding: 12px 16px; border-radius: 8px; color: white; font-weight: 600; margin-bottom: 24px; display: inline-block;">
    🌟 New prospect from idoyourquotes.com
  </div>

  <h2 style="color: #1a2b4a; margin: 0 0 16px;">Quote Assistant escalation — ${escapeHtml(params.contactName) || "—"}</h2>

  <table style="border-collapse: collapse; width: 100%; max-width: 640px; margin-bottom: 24px; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
    <tr style="background: #f8fafc;"><td style="padding: 10px 14px; font-weight: 600; width: 160px; border-bottom: 1px solid #e2e8f0;">Contact name</td><td style="padding: 10px 14px; border-bottom: 1px solid #e2e8f0;">${escapeHtml(params.contactName) || "—"}</td></tr>
    <tr><td style="padding: 10px 14px; font-weight: 600; border-bottom: 1px solid #e2e8f0;">Email</td><td style="padding: 10px 14px; border-bottom: 1px solid #e2e8f0;"><a href="mailto:${escapeHtml(params.email)}" style="color: #f59e0b;">${escapeHtml(params.email)}</a></td></tr>
    <tr style="background: #f8fafc;"><td style="padding: 10px 14px; font-weight: 600;">Account</td><td style="padding: 10px 14px;">Not signed up — public website visitor</td></tr>
  </table>

  <h3 style="color: #1a2b4a; margin: 0 0 8px; font-size: 15px;">What they want to ask</h3>
  <div style="background: #fffbeb; border-left: 3px solid #f59e0b; padding: 12px 16px; margin-bottom: 24px; border-radius: 4px; font-size: 14px; white-space: pre-wrap;">
${escapeHtml(params.summary) || "<em>No message provided</em>"}
  </div>

  <h3 style="color: #1a2b4a; margin: 0 0 8px; font-size: 15px;">Conversation transcript</h3>
  <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 12px 16px; margin-bottom: 24px; border-radius: 4px; font-size: 13px; white-space: pre-wrap; line-height: 1.55;">
${escapeHtml(params.transcriptText) || "<em>No prior chat</em>"}
  </div>

  <h3 style="color: #94a3b8; margin: 0 0 8px; font-size: 13px;">Visit context</h3>
  <table style="border-collapse: collapse; width: 100%; max-width: 640px; font-size: 12px; color: #64748b;">
    <tr><td style="padding: 4px 8px;">Started on:</td><td style="padding: 4px 8px;">${escapeHtml(params.startPagePath || "—")}</td></tr>
    <tr><td style="padding: 4px 8px;">Last on:</td><td style="padding: 4px 8px;">${escapeHtml(params.lastPagePath || "—")}</td></tr>
    <tr><td style="padding: 4px 8px;">Thread ID:</td><td style="padding: 4px 8px;">#${params.threadId}</td></tr>
    <tr><td style="padding: 4px 8px;">IP:</td><td style="padding: 4px 8px;">${escapeHtml(params.ipAddress || "—")}</td></tr>
    <tr><td style="padding: 4px 8px;">User agent:</td><td style="padding: 4px 8px;">${escapeHtml(params.userAgent || "—")}</td></tr>
  </table>

  <p style="margin-top: 24px; font-size: 12px; color: #94a3b8;">
    Reply directly to this email to respond to the prospect — Reply-To is set to their address. They are NOT a registered customer; this is a marketing-site enquiry.
  </p>

</body>
</html>`;

  const text = `Quote Assistant escalation — ${params.contactName || "—"}

CONTACT
  Name:    ${params.contactName || "—"}
  Email:   ${params.email}
  Account: Not signed up — public website visitor

WHAT THEY WANT TO ASK
${params.summary || "(no message provided)"}

CONVERSATION TRANSCRIPT
${params.transcriptText || "(no prior chat)"}

VISIT CONTEXT
  Started on:    ${params.startPagePath || "—"}
  Last on:       ${params.lastPagePath || "—"}
  Thread ID:     #${params.threadId}
  IP:            ${params.ipAddress || "—"}
  User agent:    ${params.userAgent || "—"}

Reply directly to this email — Reply-To is set to the prospect's address. They are NOT a registered customer; this is a marketing-site enquiry.
`;

  try {
    const info = await transporter.sendMail({
      from: `"IdoYourQuotes Quote Assistant" <${fromAddress}>`,
      to: supportInbox,
      replyTo: params.email,
      subject,
      html,
      text,
    });
    console.log(`[SMTP] Prospect escalation email sent for thread ${params.threadId} (messageId=${info.messageId})`);
    return true;
  } catch (err) {
    console.error("[SMTP] Prospect escalation email send failed:", err);
    return false;
  }
}
