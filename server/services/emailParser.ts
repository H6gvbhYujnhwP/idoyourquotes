/**
 * Email parser — turns Outlook .msg and standards-based .eml files into the
 * same markdown evidence block that other document parsers emit.
 *
 * The output shape mirrors server/services/wordParser.ts on purpose:
 *
 *   - `text` is the only field server/routers.ts actually reads. It contains
 *     a fully formatted "## Email Content" block with header metadata
 *     (From / To / Cc / Subject / Date / attachments) followed by the email
 *     body in plain text. This block is dropped straight into
 *     quote_inputs.processed_content, which is what every engine reads.
 *
 *   - The other fields (`format`, `from`, `to`, `subject`, `date`, etc.) are
 *     exposed for logging, debugging and any future per-field surfacing —
 *     the routers do not depend on them today.
 *
 * Why two libraries:
 *   - .eml is RFC 822 with MIME multipart, charset detection, RFC 2047
 *     encoded-word headers, quoted-printable, base64 and nested boundaries.
 *     mailparser handles all of that correctly.
 *   - .msg is Microsoft CFBF (Compound File Binary Format) — a binary OLE2
 *     container. @kenjiuno/msgreader is the de-facto pure-JS reader.
 *
 * Both libraries are pure JS — no native bindings, no postinstall scripts,
 * safe under Render's `--frozen-lockfile` + `--ignore-scripts` install.
 */

import { simpleParser, type ParsedMail, type AddressObject, type EmailAddress } from "mailparser";
import MsgReader from "@kenjiuno/msgreader";
import * as cheerio from "cheerio";

export interface EmailParseResult {
  /** The markdown-formatted block ready for processed_content. Always populated. */
  text: string;
  /** Source format detected from the filename. */
  format: "eml" | "msg";
  /** "Name <addr>" or "addr" — empty string if unknown. */
  from: string;
  /** Comma-separated recipient list — empty string if none. */
  to: string;
  /** Comma-separated Cc list — empty string if none. */
  cc: string;
  /** Subject line — empty string if none. */
  subject: string;
  /** ISO-ish date string or null if unparseable. */
  date: string | null;
  /** Filenames of attachments (we do NOT extract attachment payloads here). */
  attachmentNames: string[];
  /** Non-fatal parser messages (charset fallbacks, html-only bodies, etc.). */
  messages: string[];
}

/**
 * Public detector — used by server/routers.ts to gate the email branch of
 * the auto-analyze pipeline. Mirrors isWordDocument / isSpreadsheet.
 */
export function isEmail(mimeType: string, filename: string): boolean {
  const emailMimeTypes = [
    "message/rfc822",
    "application/vnd.ms-outlook",
  ];
  const emailExtensions = [".eml", ".msg"];
  const lower = filename.toLowerCase();
  const ext = lower.slice(lower.lastIndexOf("."));
  return emailMimeTypes.includes(mimeType) || emailExtensions.includes(ext);
}

/**
 * Public entry point. Routes to the right parser based on filename, then
 * normalises the output. Throws on parse failure so the routers' shared
 * try/catch marks the input as failed (exactly like wordParser does).
 */
export async function parseEmailFile(
  buffer: Buffer,
  filename: string,
): Promise<EmailParseResult> {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".msg")) {
    return parseMsg(buffer);
  }
  // Default to .eml for everything else (covers .eml plus any
  // message/rfc822 file that arrives with a non-standard extension).
  return parseEml(buffer);
}

// ─── .eml ────────────────────────────────────────────────────────────────────

async function parseEml(buffer: Buffer): Promise<EmailParseResult> {
  let parsed: ParsedMail;
  try {
    parsed = await simpleParser(buffer);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error parsing .eml";
    throw new Error(`Failed to parse .eml file: ${msg}`);
  }

  const messages: string[] = [];

  const from = formatAddressObject(parsed.from);
  const to = formatAddressObject(parsed.to);
  const cc = formatAddressObject(parsed.cc);
  const subject = (parsed.subject || "").trim();
  const date = parsed.date ? parsed.date.toISOString() : null;
  const attachmentNames = (parsed.attachments || [])
    .map((a) => a.filename || "")
    .filter((s) => s.length > 0);

  // Body fallback chain: text → strip(html) → textAsHtml stripped.
  // mailparser's `text` is already plain. If only html was sent we fall
  // back to cheerio which is already a project dependency.
  let body = (parsed.text || "").trim();
  if (!body && parsed.html) {
    body = htmlToText(parsed.html);
    messages.push("Email had no plain-text part — converted from HTML.");
  }
  if (!body && parsed.textAsHtml) {
    body = htmlToText(parsed.textAsHtml);
    messages.push("Email body recovered from textAsHtml fallback.");
  }
  if (!body) {
    body = "(No readable body content in this email.)";
    messages.push("Email had no extractable body.");
  }

  const text = formatForAI({
    format: "eml",
    from,
    to,
    cc,
    subject,
    date,
    body,
    attachmentNames,
  });

  return {
    text,
    format: "eml",
    from,
    to,
    cc,
    subject,
    date,
    attachmentNames,
    messages,
  };
}

// ─── .msg ────────────────────────────────────────────────────────────────────

async function parseMsg(buffer: Buffer): Promise<EmailParseResult> {
  // MsgReader takes an ArrayBuffer. Slice into a fresh buffer so we don't
  // accidentally hand it a view backed by a larger pool.
  const ab = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  );

  let fields: ReturnType<MsgReader["getFileData"]>;
  try {
    const reader = new MsgReader(ab as ArrayBuffer);
    fields = reader.getFileData();
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error parsing .msg";
    throw new Error(`Failed to parse .msg file: ${msg}`);
  }

  if (fields.error) {
    throw new Error(`Failed to parse .msg file: ${fields.error}`);
  }

  const messages: string[] = [];

  // From — senderName + senderEmail, either may be missing.
  const senderName = (fields.senderName || "").trim();
  const senderEmail = (fields.senderEmail || "").trim();
  const from =
    senderName && senderEmail
      ? `${senderName} <${senderEmail}>`
      : senderEmail || senderName;

  // Recipients — group by recipType.
  const recipients = fields.recipients || [];
  const toList: string[] = [];
  const ccList: string[] = [];
  for (const r of recipients) {
    const name = (r.name || "").trim();
    const email = (r.email || "").trim();
    const formatted =
      name && email && name !== email ? `${name} <${email}>` : email || name;
    if (!formatted) continue;
    if (r.recipType === "cc") {
      ccList.push(formatted);
    } else if (r.recipType === "bcc") {
      // Fold bcc into cc for AI context — the AI doesn't care which header
      // it came from. Surface this in messages so the warning is logged.
      ccList.push(formatted);
      messages.push("Bcc recipients were folded into Cc for AI context.");
    } else {
      // "to" or undefined — default to To.
      toList.push(formatted);
    }
  }

  const to = toList.join(", ");
  const cc = ccList.join(", ");
  const subject = (fields.subject || "").trim();

  // Date: prefer clientSubmitTime (when sender hit send), then
  // messageDeliveryTime (when it arrived).
  const rawDate = fields.clientSubmitTime || fields.messageDeliveryTime || null;
  let date: string | null = null;
  if (rawDate) {
    const d = new Date(rawDate);
    date = isNaN(d.getTime()) ? rawDate : d.toISOString();
  }

  // Body: prefer plain `body`; if empty, strip the HTML body.
  let body = (fields.body || "").trim();
  if (!body && fields.bodyHtml) {
    body = htmlToText(fields.bodyHtml);
    messages.push("Email had no plain-text body — converted from HTML.");
  }
  if (!body) {
    body = "(No readable body content in this email.)";
    messages.push("Email had no extractable body.");
  }

  // Attachments — names only. We do NOT auto-extract attachment payloads
  // for the AI (a PDF attachment is the user's job to upload separately
  // if they want it analysed). Surface filenames so the AI can reference
  // them in its understanding.
  const attachmentNames = (fields.attachments || [])
    .map((a) => a.fileName || a.fileNameShort || (a as { name?: string }).name || "")
    .filter((s) => s.length > 0);

  const text = formatForAI({
    format: "msg",
    from,
    to,
    cc,
    subject,
    date,
    body,
    attachmentNames,
  });

  return {
    text,
    format: "msg",
    from,
    to,
    cc,
    subject,
    date,
    attachmentNames,
    messages,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Format mailparser AddressObject(s) into a comma-separated "Name <addr>"
 * list. Handles single objects, arrays, undefined, and nested groups.
 */
function formatAddressObject(
  addr: AddressObject | AddressObject[] | undefined,
): string {
  if (!addr) return "";
  const objects = Array.isArray(addr) ? addr : [addr];
  const out: string[] = [];
  for (const obj of objects) {
    for (const v of obj.value || []) {
      const formatted = formatEmailAddress(v);
      if (formatted) out.push(formatted);
    }
    // Some headers (e.g. group syntax) only populate `text` and leave
    // value[] empty. Fall back to the raw text so we never silently drop.
    if ((!obj.value || obj.value.length === 0) && obj.text) {
      out.push(obj.text.trim());
    }
  }
  // De-dupe whilst preserving order.
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const s of out) {
    if (!seen.has(s)) {
      seen.add(s);
      deduped.push(s);
    }
  }
  return deduped.join(", ");
}

function formatEmailAddress(v: EmailAddress): string {
  const name = (v.name || "").trim();
  const address = (v.address || "").trim();
  if (name && address && name !== address) return `${name} <${address}>`;
  return address || name;
}

/**
 * Strip an HTML body to plain text. Uses cheerio (already a project dep).
 * Removes script/style tags, converts <br> to newlines, and collapses
 * runs of whitespace whilst preserving paragraph breaks.
 */
function htmlToText(html: string): string {
  try {
    const $ = cheerio.load(html);
    $("script, style, head").remove();
    // Convert line-break-ish elements into newlines so paragraphs survive.
    $("br").replaceWith("\n");
    $("p, div, li, tr, h1, h2, h3, h4, h5, h6").each((_, el) => {
      $(el).append("\n");
    });
    const raw = $("body").text() || $.text();
    // Collapse runs of 3+ newlines to 2, strip carriage returns,
    // and trim trailing whitespace on each line.
    return raw
      .replace(/\r/g, "")
      .split("\n")
      .map((l) => l.replace(/[ \t]+/g, " ").trim())
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  } catch {
    // Last-ditch fallback if cheerio chokes — strip tags with regex.
    return html
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, " ")
      .trim();
  }
}

/**
 * Build the markdown block that lands in processed_content. Mirrors the
 * "## Word Document Content" / "## " prefix used by wordParser so the AI
 * sees a consistent shape across evidence types.
 */
function formatForAI(p: {
  format: "eml" | "msg";
  from: string;
  to: string;
  cc: string;
  subject: string;
  date: string | null;
  body: string;
  attachmentNames: string[];
}): string {
  const lines: string[] = [];
  lines.push("## Email Content");
  lines.push("");
  if (p.from) lines.push(`**From:** ${p.from}  `);
  if (p.to) lines.push(`**To:** ${p.to}  `);
  if (p.cc) lines.push(`**Cc:** ${p.cc}  `);
  if (p.subject) lines.push(`**Subject:** ${p.subject}  `);
  if (p.date) lines.push(`**Date:** ${p.date}  `);
  if (p.attachmentNames.length > 0) {
    lines.push(`**Attachments:** ${p.attachmentNames.join(", ")}  `);
  }
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push(p.body);
  return lines.join("\n");
}
