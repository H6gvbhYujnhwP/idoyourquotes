/**
 * Claude API Helper for PDF and Image Analysis
 * Uses Anthropic's Claude API for visual document understanding
 */

import { PDFDocument } from "pdf-lib";

// Claude message content types
type TextContent = {
  type: "text";
  text: string;
};

type ImageContent = {
  type: "image";
  source: {
    type: "base64";
    media_type: "image/jpeg" | "image/png" | "image/gif" | "image/webp";
    data: string;
  };
};

type DocumentContent = {
  type: "document";
  source: {
    type: "base64";
    media_type: "application/pdf";
    data: string;
  };
};

type ClaudeContent = TextContent | ImageContent | DocumentContent;

type ClaudeMessage = {
  role: "user" | "assistant";
  content: string | ClaudeContent[];
};

export type ClaudeInvokeParams = {
  messages: ClaudeMessage[];
  system?: string;
  maxTokens?: number;
  /**
   * Sampling temperature for the model.
   *
   * Defaults to 0.1 — low enough that the QDS pricing pass, the inventory
   * pre-pass, and other extraction/classification calls behave deterministically
   * across runs of the same evidence. Without this default the Anthropic API
   * uses temperature 1.0, which produces large run-to-run drift in line items,
   * unit prices, monthly/annual classification, and proposal titles when the
   * same tender pack is generated more than once. See generalEngine.ts main
   * pricing pass and inventory pre-pass for the primary code paths.
   *
   * Pass an explicit value to override (e.g. set higher for creative tasks).
   */
  temperature?: number;
};

export type ClaudeInvokeResult = {
  id: string;
  content: string;
  model: string;
  stopReason: string | null;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
};

/**
 * Invoke Claude API for document and image analysis
 */
export async function invokeClaude(params: ClaudeInvokeParams): Promise<ClaudeInvokeResult> {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  
  if (!anthropicKey) {
    throw new Error("ANTHROPIC_API_KEY is not configured");
  }

  const payload = {
    model: "claude-sonnet-4-20250514",
    max_tokens: params.maxTokens || 4096,
    system: params.system,
    messages: params.messages,
    // Default to 0.1 — see ClaudeInvokeParams.temperature for rationale.
    temperature: params.temperature ?? 0.1,
  };

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": anthropicKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("[Claude] API error:", response.status, errorText);
    throw new Error(`Claude API failed: ${response.status} - ${errorText}`);
  }

  const data = await response.json();

  // Extract text content from response
  let textContent = "";
  if (Array.isArray(data.content)) {
    for (const block of data.content) {
      if (block.type === "text") {
        textContent += block.text;
      }
    }
  }

  return {
    id: data.id,
    content: textContent,
    model: data.model,
    stopReason: data.stop_reason,
    usage: {
      inputTokens: data.usage?.input_tokens || 0,
      outputTokens: data.usage?.output_tokens || 0,
    },
  };
}

// ── PDF Chunking Helpers ──────────────────────────────────────────────

const MAX_PAGES_PER_CHUNK = 10; // ~10 pages keeps us well under 30K tokens
const DELAY_BETWEEN_CHUNKS_MS = 5000; // 5 seconds between API calls
const RETRY_DELAY_MS = 30000; // 30 seconds on rate limit before retry

/**
 * Split a PDF buffer into smaller PDF buffers of maxPages each
 */
async function splitPdfIntoChunks(pdfBuffer: Buffer, maxPages: number = MAX_PAGES_PER_CHUNK): Promise<Buffer[]> {
  const sourcePdf = await PDFDocument.load(pdfBuffer);
  const totalPages = sourcePdf.getPageCount();

  if (totalPages <= maxPages) {
    // Small PDF, no splitting needed
    return [pdfBuffer];
  }

  const chunks: Buffer[] = [];

  for (let start = 0; start < totalPages; start += maxPages) {
    const end = Math.min(start + maxPages, totalPages);
    const chunkPdf = await PDFDocument.create();
    const pageIndices = Array.from({ length: end - start }, (_, i) => start + i);
    const copiedPages = await chunkPdf.copyPages(sourcePdf, pageIndices);
    for (const page of copiedPages) {
      chunkPdf.addPage(page);
    }
    const chunkBytes = await chunkPdf.save();
    chunks.push(Buffer.from(chunkBytes));
  }

  return chunks;
}

/**
 * Sleep helper
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Analyze a single PDF chunk with Claude, with one retry on rate limit
 */
async function analyzeChunkWithRetry(
  chunkBuffer: Buffer,
  prompt: string,
  systemPrompt: string,
  chunkLabel: string,
  maxTokens: number = 4096,
): Promise<string> {
  const base64Data = chunkBuffer.toString("base64");

  const callClaude = () =>
    invokeClaude({
      system: systemPrompt,
      maxTokens,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: {
                type: "base64",
                media_type: "application/pdf",
                data: base64Data,
              },
            },
            {
              type: "text",
              text: prompt,
            },
          ],
        },
      ],
    });

  try {
    const result = await callClaude();
    console.log(`[PDF Chunk] ${chunkLabel} processed (${result.usage.inputTokens} input tokens)`);
    return result.content;
  } catch (error: any) {
    const isRateLimit =
      error.message?.includes("rate_limit") ||
      error.message?.includes("429") ||
      error.message?.includes("30,000");

    if (isRateLimit) {
      console.log(`[PDF Chunk] ${chunkLabel} hit rate limit, waiting ${RETRY_DELAY_MS / 1000}s and retrying...`);
      await sleep(RETRY_DELAY_MS);

      try {
        const retryResult = await callClaude();
        console.log(`[PDF Chunk] ${chunkLabel} retry succeeded (${retryResult.usage.inputTokens} input tokens)`);
        return retryResult.content;
      } catch (retryError: any) {
        console.error(`[PDF Chunk] ${chunkLabel} retry also failed:`, retryError.message);
        return `[Section ${chunkLabel}: Processing failed after retry - ${retryError.message}]`;
      }
    }

    // Non-rate-limit error: don't retry, just log and return error marker
    console.error(`[PDF Chunk] ${chunkLabel} failed:`, error.message);
    return `[Section ${chunkLabel}: Processing failed - ${error.message}]`;
  }
}

/**
 * Analyze a PDF document using Claude - with automatic chunking for large PDFs
 * Splits PDFs larger than MAX_PAGES_PER_CHUNK pages into smaller chunks,
 * processes each sequentially with delays, and combines results.
 *
 * @param pdfBuffer - PDF file as Buffer
 * @param prompt - Analysis prompt
 * @param systemPrompt - Optional system prompt
 */
export async function analyzePdfWithClaude(
  pdfBuffer: Buffer,
  prompt: string,
  systemPrompt?: string
): Promise<string> {
  const defaultSystem =
    "You are a document analyzer specializing in construction, engineering, and technical documents. Extract all relevant information for quoting purposes.";
  const system = systemPrompt || defaultSystem;

  // Determine page count
  let totalPages = 1;
  try {
    const pdfDoc = await PDFDocument.load(pdfBuffer);
    totalPages = pdfDoc.getPageCount();
  } catch {
    // If we can't read page count, treat as single chunk
    totalPages = 1;
  }

  console.log(`[PDF Extract] PDF has ${totalPages} pages`);

  // Small PDF: send directly (no chunking needed)
  if (totalPages <= MAX_PAGES_PER_CHUNK) {
    console.log(`[PDF Extract] Small PDF (${totalPages} pages), processing in single call`);
    const base64Data = pdfBuffer.toString("base64");

    const result = await invokeClaude({
      system,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: {
                type: "base64",
                media_type: "application/pdf",
                data: base64Data,
              },
            },
            {
              type: "text",
              text: prompt,
            },
          ],
        },
      ],
    });

    return result.content;
  }

  // Large PDF: split and process chunks sequentially
  console.log(`[PDF Extract] Large PDF (${totalPages} pages), splitting into chunks of ${MAX_PAGES_PER_CHUNK} pages`);
  const chunks = await splitPdfIntoChunks(pdfBuffer, MAX_PAGES_PER_CHUNK);
  console.log(`[PDF Extract] Split into ${chunks.length} chunks`);

  const chunkResults: string[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const startPage = i * MAX_PAGES_PER_CHUNK + 1;
    const endPage = Math.min((i + 1) * MAX_PAGES_PER_CHUNK, totalPages);
    const chunkLabel = `Pages ${startPage}-${endPage}`;

    console.log(`[PDF Extract] Processing chunk ${i + 1}/${chunks.length} (${chunkLabel})`);

    const chunkPrompt = `${prompt}\n\nNote: This is section ${i + 1} of ${chunks.length} (${chunkLabel} of ${totalPages} total pages). Extract all relevant information from these pages.`;

    const chunkContent = await analyzeChunkWithRetry(
      chunks[i],
      chunkPrompt,
      system,
      chunkLabel,
    );

    chunkResults.push(`## ${chunkLabel}\n\n${chunkContent}`);

    // Add delay between chunks to avoid rate limits
    if (i < chunks.length - 1) {
      console.log(`[PDF Extract] Waiting ${DELAY_BETWEEN_CHUNKS_MS / 1000}s before next chunk...`);
      await sleep(DELAY_BETWEEN_CHUNKS_MS);
    }
  }

  // Combine all chunk results
  const combined = `# Document Analysis (${totalPages} pages, processed in ${chunks.length} sections)\n\n` +
    chunkResults.join("\n\n---\n\n");

  console.log(`[PDF Extract] Complete - all ${chunks.length} chunks processed`);

  return combined;
}

/**
 * Analyze an image using Claude
 * @param imageBuffer - Image file as Buffer
 * @param mimeType - Image MIME type
 * @param prompt - Analysis prompt
 * @param systemPrompt - Optional system prompt
 */
export async function analyzeImageWithClaude(
  imageBuffer: Buffer,
  mimeType: "image/jpeg" | "image/png" | "image/gif" | "image/webp",
  prompt: string,
  systemPrompt?: string
): Promise<string> {
  const base64Data = imageBuffer.toString("base64");

  const result = await invokeClaude({
    system: systemPrompt || "You are an image analyzer specializing in construction, engineering, and technical drawings. Extract all relevant information for quoting purposes.",
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: mimeType,
              data: base64Data,
            },
          },
          {
            type: "text",
            text: prompt,
          },
        ],
      },
    ],
  });

  return result.content;
}

/**
 * Check if Claude API is configured
 */
export function isClaudeConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

// ══════════════════════════════════════════════════════════════════════
// OpenAI GPT-4o PDF Analysis (Text extraction + AI analysis)
// Faster and more reliable than vision-based PDF processing
// ══════════════════════════════════════════════════════════════════════

import { openai, isOpenAIConfigured } from './openai';
// pdf-parse v2 is ESM-with-CJS entry; use createRequire for the CJS build.
// The v2 API is { PDFParse } class (breaking change from v1's callable export).
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { PDFParse } = require('pdf-parse') as { PDFParse: new (opts: { data: Buffer | Uint8Array }) => any };

export { isOpenAIConfigured };

const TEXT_CHUNK_SIZE = 80000; // ~20K tokens worth of text per chunk
const GPT4_DELAY_BETWEEN_CHUNKS_MS = 1000; // 1 second between chunks
const OCR_PAGE_CAP = 20; // Max pages sent to GPT-4o on PDF-native fallback

/**
 * Secondary text-layer extractor — uses pdfjs-dist as a fallback when
 * pdf-parse returns empty text. Some PDFs encode text in a way that
 * pdf-parse cannot read (overlay rendering, certain export pipelines)
 * but pdfjs-dist can handle. Dynamic import keeps the legacy ESM build
 * out of the top-level require chain.
 */
async function extractTextWithPdfJs(pdfBuffer: Buffer): Promise<{ text: string; pageCount: number }> {
  const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const data = new Uint8Array(pdfBuffer);
  const doc = await pdfjs.getDocument({ data, useSystemFonts: true, disableFontFace: true }).promise;
  const pageCount: number = doc.numPages;
  const parts: string[] = [];
  for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
    try {
      const page = await doc.getPage(pageNum);
      const textContent = await page.getTextContent();
      const items: any[] = (textContent as any).items || [];
      const pageText = items
        .map((it) => (typeof it?.str === 'string' ? it.str : ''))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (pageText) {
        parts.push(pageText);
      }
    } catch (pageErr: any) {
      console.error(`[OpenAI PDF] pdfjs page ${pageNum} failed:`, pageErr?.message);
    }
  }
  return { text: parts.join('\n\n'), pageCount };
}

/**
 * PDF-native fallback — sends the PDF directly to GPT-4o via the Chat
 * Completions file input. GPT-4o reads PDFs natively (both text layers and
 * page imagery), so this covers true scans, image-only PDFs, and flattened
 * exports without any server-side rasterisation or extra dependencies.
 *
 * If the PDF has more than OCR_PAGE_CAP pages, it's trimmed to the first
 * OCR_PAGE_CAP pages using pdf-lib (already a project dependency) to
 * protect against runaway cost on mis-uploaded large scans.
 */
async function ocrPdfWithVision(
  pdfBuffer: Buffer,
  prompt: string,
  systemPrompt: string
): Promise<string> {
  // Count pages and, if over cap, produce a trimmed copy that only contains
  // the first OCR_PAGE_CAP pages.
  let totalPages = 1;
  let bufferToSend: Buffer = pdfBuffer;
  let skippedPages = 0;

  try {
    const srcDoc = await PDFDocument.load(pdfBuffer);
    totalPages = srcDoc.getPageCount();
    if (totalPages > OCR_PAGE_CAP) {
      skippedPages = totalPages - OCR_PAGE_CAP;
      const trimmedDoc = await PDFDocument.create();
      const indexes = Array.from({ length: OCR_PAGE_CAP }, (_, i) => i);
      const copied = await trimmedDoc.copyPages(srcDoc, indexes);
      copied.forEach((p) => trimmedDoc.addPage(p));
      const trimmedBytes = await trimmedDoc.save();
      bufferToSend = Buffer.from(trimmedBytes);
      console.log(
        `[OpenAI PDF] PDF has ${totalPages} pages — trimming to first ${OCR_PAGE_CAP} for Vision send (${skippedPages} page(s) skipped)`
      );
    }
  } catch (err: any) {
    console.error(`[OpenAI PDF] Page-count/trim step failed (continuing with original buffer):`, err?.message);
  }

  const pagesProcessed = Math.min(totalPages, OCR_PAGE_CAP);
  console.log(`[OpenAI PDF] Sending ${pagesProcessed}-page PDF directly to GPT-4o (${bufferToSend.length} bytes)...`);

  const base64 = bufferToSend.toString('base64');
  const fileContent: any = {
    type: 'file',
    file: {
      file_data: `data:application/pdf;base64,${base64}`,
      filename: 'document.pdf',
    },
  };
  const promptText = `${prompt}\n\nThis PDF has no extractable text layer — read the page imagery directly. Extract every visible text element, number, table row, heading, annotation, and diagram label. Preserve structure where possible (headings, lists, tables).`;

  let analysis = '';
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: [
            { type: 'text', text: promptText },
            fileContent,
          ] as any,
        },
      ],
      max_tokens: 4096,
      temperature: 0.1,
    });
    analysis = response.choices[0]?.message?.content || '';
    console.log(`[OpenAI PDF] Vision PDF analysis complete (${analysis.length} chars)`);
  } catch (err: any) {
    if (err?.status === 429) {
      console.log(`[OpenAI PDF] Rate limit on Vision PDF send, waiting 10s and retrying once...`);
      await sleep(10000);
      try {
        const retryResponse = await openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [
            { role: 'system', content: systemPrompt },
            {
              role: 'user',
              content: [
                { type: 'text', text: promptText },
                fileContent,
              ] as any,
            },
          ],
          max_tokens: 4096,
          temperature: 0.1,
        });
        analysis = retryResponse.choices[0]?.message?.content || '';
        console.log(`[OpenAI PDF] Vision PDF retry succeeded (${analysis.length} chars)`);
      } catch (retryErr: any) {
        console.error(`[OpenAI PDF] Vision PDF retry failed:`, retryErr?.message);
        throw retryErr;
      }
    } else {
      console.error(`[OpenAI PDF] Vision PDF send failed:`, err?.message);
      throw err;
    }
  }

  if (!analysis.trim()) {
    return '';
  }

  let output =
    `# Document Analysis (${totalPages} page${totalPages === 1 ? '' : 's'}, ` +
    `processed ${pagesProcessed} page${pagesProcessed === 1 ? '' : 's'} via GPT-4o direct PDF read)\n\n` +
    analysis;

  if (skippedPages > 0) {
    output +=
      `\n\n---\n\n**Note:** ${skippedPages} additional page${skippedPages === 1 ? ' was' : 's were'} ` +
      `present in this PDF but skipped because they exceed the ${OCR_PAGE_CAP}-page cap. ` +
      `Upload a smaller section if quoting from those pages is needed.`;
  }

  return output;
}

/**
 * Analyze PDF with OpenAI GPT-4o.
 *
 * Three-stage extraction with fallback:
 *   1. pdf-parse        — fast text-layer read, no AI call, covers most PDFs.
 *   2. pdfjs-dist       — secondary text-layer read for PDFs pdf-parse can't
 *                         handle (overlay rendering, awkward exports).
 *   3. OCR via Vision   — rasterises pages and sends each to GPT-4o Vision,
 *                         capped at OCR_PAGE_CAP pages. Only for true scans.
 *
 * If stages 1 or 2 produce text, it goes through the standard GPT-4o analysis
 * flow (single call for small docs, chunked for large). If the OCR fallback
 * runs, its output already is the analysis and is returned directly.
 */
export async function analyzePdfWithOpenAI(
  pdfBuffer: Buffer,
  prompt: string,
  systemPrompt?: string
): Promise<string> {
  if (!isOpenAIConfigured()) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const system = systemPrompt ||
    "You are a document analyzer specializing in construction, engineering, and technical documents. Extract all relevant information for quoting purposes.";

  // Stage 1: pdf-parse v2 (fast, no API call)
  let pdfText = "";
  let totalPages = 1;

  try {
    console.log(`[OpenAI PDF] Extracting text from PDF (primary parser)...`);
    const parser = new PDFParse({ data: pdfBuffer });
    try {
      const parsed = await parser.getText();
      // pdf-parse v2 injects "-- N of M --" page separators into its text output
      // even for PDFs with no extractable content. Strip them before the emptiness
      // check — otherwise a scan-only PDF with 3 pages returns ~44 chars of pure
      // separators, which naively trims to non-empty and sends garbage to GPT-4o.
      const rawText = parsed?.text || "";
      const stripped = rawText.replace(/--\s*\d+\s+of\s+\d+\s*--/g, '').trim();
      pdfText = stripped;
      totalPages = parsed?.total || 1;
      console.log(`[OpenAI PDF] Primary parser: ${pdfText.length} chars (post-strip) from ${totalPages} page(s)`);
    } finally {
      // Release the underlying pdfjs document — v2 keeps a handle open otherwise.
      try { await parser.destroy(); } catch { /* noop */ }
    }
  } catch (err: any) {
    console.error(`[OpenAI PDF] Primary parser failed:`, err?.message);
    try {
      const pdfDoc = await PDFDocument.load(pdfBuffer);
      totalPages = pdfDoc.getPageCount();
    } catch {
      totalPages = 1;
    }
  }

  // Stage 2: pdfjs-dist (fast, no API call) — only if primary returned empty
  if (!pdfText) {
    try {
      console.log(`[OpenAI PDF] Primary parser returned empty, trying secondary parser (pdfjs-dist)...`);
      const secondary = await extractTextWithPdfJs(pdfBuffer);
      const secondaryText = secondary.text.trim();
      if (secondaryText) {
        pdfText = secondaryText;
        if (secondary.pageCount > 0) totalPages = secondary.pageCount;
        console.log(`[OpenAI PDF] Secondary parser: ${pdfText.length} chars from ${totalPages} page(s)`);
      } else {
        console.log(`[OpenAI PDF] Secondary parser: also returned empty`);
      }
    } catch (err: any) {
      console.error(`[OpenAI PDF] Secondary parser failed:`, err?.message);
    }
  }

  // Stage 3: OCR via Vision — only if both text-layer parsers empty
  if (!pdfText) {
    try {
      console.log(`[OpenAI PDF] Both text-layer parsers empty — falling back to OCR via Vision (cap: ${OCR_PAGE_CAP} pages)`);
      const ocrOutput = await ocrPdfWithVision(pdfBuffer, prompt, system);
      if (ocrOutput.trim()) {
        return ocrOutput;
      }
      console.log(`[OpenAI PDF] OCR returned empty output`);
    } catch (err: any) {
      console.error(`[OpenAI PDF] OCR fallback failed:`, err?.message);
    }

    // All three stages failed — return the original "scanned" stub.
    console.log(`[OpenAI PDF] All extraction methods failed — returning scanned-PDF stub`);
    return `# Document Analysis (${totalPages} pages)\n\n` +
      `**Note:** This PDF appears to be scanned or image-based with no extractable text. ` +
      `The document has ${totalPages} page(s). To process scanned PDFs, please use image-based analysis or OCR.`;
  }

  // Step 2: If text is small enough, send in a single API call
  if (pdfText.length <= TEXT_CHUNK_SIZE) {
    console.log(`[OpenAI PDF] Small document (${pdfText.length} chars), processing in single call`);

    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: system },
          {
            role: 'user',
            content: `${prompt}\n\n--- DOCUMENT TEXT (${totalPages} pages) ---\n\n${pdfText}`,
          },
        ],
        max_tokens: 4096,
        temperature: 0.1,
      });

      const analysis = response.choices[0]?.message?.content || '';
      console.log(`[OpenAI PDF] Complete - single call (${analysis.length} chars output)`);
      return analysis;
    } catch (error: any) {
      console.error(`[OpenAI PDF] API call failed:`, error.message);
      // One retry on rate limit
      if (error.status === 429) {
        console.log(`[OpenAI PDF] Rate limit, waiting 10s and retrying...`);
        await sleep(10000);
        const retryResponse = await openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [
            { role: 'system', content: system },
            {
              role: 'user',
              content: `${prompt}\n\n--- DOCUMENT TEXT (${totalPages} pages) ---\n\n${pdfText}`,
            },
          ],
          max_tokens: 4096,
          temperature: 0.1,
        });
        return retryResponse.choices[0]?.message?.content || '';
      }
      throw error;
    }
  }

  // Step 3: Large document - split text into chunks and process each
  const textChunks: string[] = [];
  for (let i = 0; i < pdfText.length; i += TEXT_CHUNK_SIZE) {
    textChunks.push(pdfText.slice(i, i + TEXT_CHUNK_SIZE));
  }
  console.log(`[OpenAI PDF] Large document (${pdfText.length} chars), split into ${textChunks.length} text chunks`);

  const chunkResults: string[] = [];

  for (let i = 0; i < textChunks.length; i++) {
    const chunkLabel = `Section ${i + 1} of ${textChunks.length}`;
    console.log(`[OpenAI PDF] Processing ${chunkLabel}...`);

    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: system },
          {
            role: 'user',
            content: `${prompt}\n\nNote: This is ${chunkLabel} of a ${totalPages}-page document.\n\n--- DOCUMENT TEXT (${chunkLabel}) ---\n\n${textChunks[i]}`,
          },
        ],
        max_tokens: 4096,
        temperature: 0.1,
      });

      const analysis = response.choices[0]?.message?.content || '';
      chunkResults.push(`## ${chunkLabel}\n\n${analysis}`);
      console.log(`[OpenAI PDF] ${chunkLabel} completed (${analysis.length} chars)`);

      if (i < textChunks.length - 1) {
        await sleep(GPT4_DELAY_BETWEEN_CHUNKS_MS);
      }
    } catch (error: any) {
      console.error(`[OpenAI PDF] ${chunkLabel} failed:`, error.message);

      if (error.status === 429) {
        console.log(`[OpenAI PDF] Rate limit hit, waiting 10s and retrying...`);
        await sleep(10000);
        try {
          const retryResponse = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [
              { role: 'system', content: system },
              {
                role: 'user',
                content: `${prompt}\n\n--- DOCUMENT TEXT (${chunkLabel}) ---\n\n${textChunks[i]}`,
              },
            ],
            max_tokens: 4096,
            temperature: 0.1,
          });
          const analysis = retryResponse.choices[0]?.message?.content || '';
          chunkResults.push(`## ${chunkLabel}\n\n${analysis}`);
          console.log(`[OpenAI PDF] Retry successful for ${chunkLabel}`);
        } catch (retryError: any) {
          console.error(`[OpenAI PDF] Retry failed:`, retryError.message);
          chunkResults.push(`[${chunkLabel}: Processing failed - ${retryError.message}]`);
        }
      } else {
        chunkResults.push(`[${chunkLabel}: Processing failed - ${error.message}]`);
      }
    }
  }

  const combined = `# Document Analysis (${totalPages} pages, processed in ${textChunks.length} sections via GPT-4o)\n\n` +
    chunkResults.join('\n\n---\n\n');

  console.log(`[OpenAI PDF] Complete - ${textChunks.length} chunks processed`);
  return combined;
}
