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
// pdf-parse is CommonJS - use createRequire for ESM compatibility
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

export { isOpenAIConfigured };

const TEXT_CHUNK_SIZE = 80000; // ~20K tokens worth of text per chunk
const GPT4_DELAY_BETWEEN_CHUNKS_MS = 1000; // 1 second between chunks
const OCR_PAGE_CAP = 20; // Max pages sent to Vision on scanned-PDF fallback

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
 * OCR fallback — rasterises PDF pages and sends each to OpenAI Vision.
 * Triggered only when both text-layer extractors return empty (true scans,
 * image-only PDFs, flattened exports). Capped at OCR_PAGE_CAP pages to
 * protect against runaway cost on mis-uploaded large scans.
 */
async function ocrPdfWithVision(
  pdfBuffer: Buffer,
  prompt: string,
  systemPrompt: string
): Promise<string> {
  const { pdfToPng }: any = await import('pdf-to-png-converter');

  // viewportScale 2.0 is a reasonable quality/size trade-off for OCR accuracy.
  // disableFontFace/useSystemFonts help rendering succeed on Render's Linux
  // container without embedded font assets.
  const pngPages = await pdfToPng(pdfBuffer, {
    viewportScale: 2.0,
    disableFontFace: true,
    useSystemFonts: false,
  });

  const totalPages = pngPages.length;
  const pagesToProcess = pngPages.slice(0, OCR_PAGE_CAP);
  const skippedPages = totalPages - pagesToProcess.length;

  console.log(
    `[OpenAI PDF] OCR: rasterised ${totalPages} page(s), sending ${pagesToProcess.length} to Vision` +
      (skippedPages > 0 ? ` (${skippedPages} beyond ${OCR_PAGE_CAP}-page cap skipped)` : '')
  );

  const pageResults: string[] = [];
  for (let i = 0; i < pagesToProcess.length; i++) {
    const page: any = pagesToProcess[i];
    const pageLabel = `Page ${i + 1} of ${totalPages}`;
    const content: Buffer | undefined = page?.content;
    if (!content) {
      console.error(`[OpenAI PDF] OCR: ${pageLabel} has no rasterised content, skipping`);
      pageResults.push(`[${pageLabel}: no image produced]`);
      continue;
    }

    console.log(`[OpenAI PDF] OCR: processing ${pageLabel}...`);
    try {
      const base64 = content.toString('base64');
      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `${prompt}\n\nThis is ${pageLabel} of a scanned or image-based document. Extract every visible text element, number, table row, heading, annotation, and diagram label from this page image. Preserve structure where possible (headings, lists, tables).`,
              },
              { type: 'image_url', image_url: { url: `data:image/png;base64,${base64}` } },
            ],
          },
        ],
        max_tokens: 4096,
        temperature: 0.1,
      });
      const pageAnalysis = response.choices[0]?.message?.content || '';
      pageResults.push(`## ${pageLabel}\n\n${pageAnalysis}`);
      console.log(`[OpenAI PDF] OCR: ${pageLabel} complete (${pageAnalysis.length} chars)`);

      if (i < pagesToProcess.length - 1) {
        await sleep(GPT4_DELAY_BETWEEN_CHUNKS_MS);
      }
    } catch (err: any) {
      console.error(`[OpenAI PDF] OCR: ${pageLabel} failed:`, err?.message);
      if (err?.status === 429) {
        console.log(`[OpenAI PDF] OCR: rate limit on ${pageLabel}, waiting 10s and retrying once...`);
        await sleep(10000);
        try {
          const base64 = content.toString('base64');
          const retryResponse = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [
              { role: 'system', content: systemPrompt },
              {
                role: 'user',
                content: [
                  {
                    type: 'text',
                    text: `${prompt}\n\nThis is ${pageLabel} of a scanned or image-based document. Extract every visible text element, number, table row, heading, annotation, and diagram label from this page image.`,
                  },
                  { type: 'image_url', image_url: { url: `data:image/png;base64,${base64}` } },
                ],
              },
            ],
            max_tokens: 4096,
            temperature: 0.1,
          });
          const retryAnalysis = retryResponse.choices[0]?.message?.content || '';
          pageResults.push(`## ${pageLabel}\n\n${retryAnalysis}`);
          console.log(`[OpenAI PDF] OCR: retry on ${pageLabel} succeeded`);
        } catch (retryErr: any) {
          console.error(`[OpenAI PDF] OCR: retry on ${pageLabel} failed:`, retryErr?.message);
          pageResults.push(`[${pageLabel}: OCR failed - ${retryErr?.message || 'unknown error'}]`);
        }
      } else {
        pageResults.push(`[${pageLabel}: OCR failed - ${err?.message || 'unknown error'}]`);
      }
    }
  }

  let output =
    `# Document Analysis (${totalPages} page${totalPages === 1 ? '' : 's'}, ` +
    `OCR-processed ${pagesToProcess.length} page${pagesToProcess.length === 1 ? '' : 's'} via GPT-4o Vision)\n\n` +
    pageResults.join('\n\n---\n\n');

  if (skippedPages > 0) {
    output +=
      `\n\n---\n\n**Note:** ${skippedPages} additional page${skippedPages === 1 ? ' was' : 's were'} ` +
      `present in this PDF but skipped because they exceed the ${OCR_PAGE_CAP}-page OCR cap. ` +
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

  // Stage 1: pdf-parse (fast, no API call)
  let pdfText = "";
  let totalPages = 1;

  try {
    console.log(`[OpenAI PDF] Extracting text from PDF (primary parser)...`);
    const parsed = await pdfParse(pdfBuffer);
    pdfText = (parsed.text || "").trim();
    totalPages = parsed.numpages || 1;
    console.log(`[OpenAI PDF] Primary parser: ${pdfText.length} chars from ${totalPages} page(s)`);
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
