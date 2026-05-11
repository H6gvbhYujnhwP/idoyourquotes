/**
 * Upload MIME validation.
 *
 * Inspects the actual bytes of an uploaded buffer to verify its real type,
 * rather than trusting the client-supplied Content-Type header. This closes
 * a class of attacks where an HTML file with a .pdf extension and a forged
 * Content-Type would be stored and later served back to a browser, enabling
 * XSS via the app's own origin.
 *
 * Backed by the `file-type` package (magic-byte sniffing). For formats that
 * `file-type` cannot reliably detect from headers alone (.eml plain-text,
 * legacy .msg Outlook files), we fall back to lightweight shape checks.
 */
import { fileTypeFromBuffer } from "file-type";

export type UploadInputType = "pdf" | "image" | "audio" | "email" | "document";

/**
 * Allowlist of real MIME types per uploadFile inputType.
 *
 * Keep this conservative — only formats the downstream processing
 * pipeline (analyzePdfWithOpenAI / image analyzer / audio transcription /
 * Word/Excel parsers / email parser) actually accepts.
 */
const ALLOWED_MIME_BY_INPUT_TYPE: Record<UploadInputType, readonly string[]> = {
  pdf: ["application/pdf"],
  image: ["image/png", "image/jpeg", "image/webp", "image/gif"],
  audio: [
    "audio/mpeg",     // .mp3
    "audio/mp4",      // .m4a
    "audio/wav",      // .wav
    "audio/x-wav",
    "audio/webm",     // .webm
    "audio/ogg",      // .ogg
    "audio/flac",
  ],
  document: [
    // Modern Office (Open XML, zip-based)
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",        // .xlsx
    // Legacy Office (OLE compound)
    "application/msword",                                                       // .doc
    "application/vnd.ms-excel",                                                 // .xls
    "application/x-cfb",                                                        // file-type returns this for legacy OLE
  ],
  email: [
    "message/rfc822",                  // .eml (when file-type detects it)
    "application/vnd.ms-outlook",      // .msg
    "application/x-cfb",               // .msg is an OLE compound file — file-type may return this
  ],
} as const;

export interface ValidationResult {
  ok: boolean;
  detectedType?: string;
  /** Friendly message safe to surface to end users. */
  error?: string;
}

/**
 * Validate an uploaded buffer against the allowlist for its declared
 * inputType. The first 4 KB of the buffer is enough for magic-byte sniffing
 * — file-type only reads what it needs.
 *
 * Returns { ok: true } on success, or { ok: false, error } with a
 * user-friendly error string.
 */
export async function validateUploadMime(
  buffer: Buffer,
  inputType: UploadInputType,
  filename?: string,
): Promise<ValidationResult> {
  if (!buffer || buffer.length === 0) {
    return { ok: false, error: "Uploaded file is empty." };
  }

  const allowed = ALLOWED_MIME_BY_INPUT_TYPE[inputType];
  if (!allowed) {
    return { ok: false, error: "Sorry, that file type isn't allowed." };
  }

  const detected = await fileTypeFromBuffer(buffer);

  // file-type returned a definitive match — check it against the allowlist.
  if (detected) {
    if (allowed.includes(detected.mime)) {
      return { ok: true, detectedType: detected.mime };
    }
    return {
      ok: false,
      detectedType: detected.mime,
      error: "Sorry, that file type isn't allowed.",
    };
  }

  // file-type returned null — the format has no reliable magic bytes.
  // For email inputs, fall back to shape sniffing.
  if (inputType === "email") {
    if (looksLikeEml(buffer)) {
      return { ok: true, detectedType: "message/rfc822" };
    }
    return { ok: false, error: "Sorry, that file type isn't allowed." };
  }

  // For documents, file-type sometimes returns null for very small or
  // non-standard .doc files. Allow only if the filename clearly indicates
  // a known document extension — defence in depth, not the primary check.
  if (inputType === "document" && filename) {
    const ext = filename.toLowerCase().split(".").pop();
    if (ext === "docx" || ext === "xlsx" || ext === "doc" || ext === "xls") {
      // Still require some structural marker — zip header for OOXML,
      // OLE signature for legacy. Both would normally be caught by
      // file-type; reaching here means file-type returned null on a
      // buffer that's likely too short to fingerprint. Reject to be safe.
      return { ok: false, error: "Sorry, that file type isn't allowed." };
    }
  }

  return { ok: false, error: "Sorry, that file type isn't allowed." };
}

/**
 * Heuristic for plain-text .eml files (RFC 5322).
 * An .eml starts with a header block: lines like "From: ...", "To: ...",
 * "Subject: ...", "Date: ...", "Received: ..." etc. We sample the first
 * 1 KB as ASCII and look for at least one canonical header line.
 */
function looksLikeEml(buffer: Buffer): boolean {
  const sample = buffer.subarray(0, 1024).toString("ascii");
  // Must look like a header line: "Header-Name: value" at the start of a line.
  // Check for at least one of the canonical RFC 5322 headers.
  const headerRegex = /^(From|To|Subject|Date|Received|Message-ID|MIME-Version|Return-Path|Reply-To|Cc):\s+/im;
  return headerRegex.test(sample);
}
