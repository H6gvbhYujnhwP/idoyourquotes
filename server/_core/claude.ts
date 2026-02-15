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
// OpenAI GPT-4 Turbo PDF Analysis (Faster, Higher Rate Limits)
// ══════════════════════════════════════════════════════════════════════

import { openai, isOpenAIConfigured } from './openai';

const GPT4_MAX_PAGES_PER_CHUNK = 40; // GPT-4 can handle 4x more than Claude
const GPT4_DELAY_BETWEEN_CHUNKS_MS = 2000; // 2 seconds (vs 5s for Claude)

/**
 * Analyze PDF with OpenAI GPT-4 Turbo Vision
 * Much faster and higher rate limits than Claude (150K vs 30K tokens/min)
 */
export async function analyzePdfWithOpenAI(
  pdfBuffer: Buffer,
  prompt: string,
  systemPrompt?: string
): Promise<string> {
  if (!isOpenAIConfigured()) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const defaultSystem = systemPrompt || 
    "You are a document analyzer specializing in construction, engineering, and technical documents. Extract all relevant information for quoting purposes.";

  // Determine page count
  let totalPages = 1;
  try {
    const pdfDoc = await PDFDocument.load(pdfBuffer);
    totalPages = pdfDoc.getPageCount();
  } catch {
    totalPages = 1;
  }

  console.log(`[OpenAI PDF] PDF has ${totalPages} pages`);

  // GPT-4 can handle larger chunks (40 pages vs Claude's 10)
  const chunks = await splitPdfIntoChunks(pdfBuffer, GPT4_MAX_PAGES_PER_CHUNK);
  console.log(`[OpenAI PDF] Split into ${chunks.length} chunks (${GPT4_MAX_PAGES_PER_CHUNK} pages each)`);

  const chunkResults: string[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const startPage = i * GPT4_MAX_PAGES_PER_CHUNK + 1;
    const endPage = Math.min((i + 1) * GPT4_MAX_PAGES_PER_CHUNK, totalPages);
    const chunkLabel = `Pages ${startPage}-${endPage}`;

    console.log(`[OpenAI PDF] Processing chunk ${i + 1}/${chunks.length} (${chunkLabel})`);

    try {
      const base64Pdf = chunks[i].toString('base64');

      const response = await openai.chat.completions.create({
        model: 'gpt-4-turbo',
        messages: [
          {
            role: 'system',
            content: defaultSystem,
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `${prompt}\n\nNote: This is section ${i + 1} of ${chunks.length} (${chunkLabel} of ${totalPages} total pages). Extract all relevant information from these pages.`,
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:application/pdf;base64,${base64Pdf}`,
                  detail: 'high',
                },
              },
            ],
          },
        ],
        max_tokens: 4096,
        temperature: 0.1,
      });

      const analysis = response.choices[0]?.message?.content || '';
      chunkResults.push(`## ${chunkLabel}\n\n${analysis}`);
      
      console.log(`[OpenAI PDF] Chunk ${i + 1} completed (${analysis.length} chars)`);

      if (i < chunks.length - 1) {
        console.log(`[OpenAI PDF] Waiting ${GPT4_DELAY_BETWEEN_CHUNKS_MS / 1000}s before next chunk...`);
        await sleep(GPT4_DELAY_BETWEEN_CHUNKS_MS);
      }

    } catch (error: any) {
      console.error(`[OpenAI PDF] Chunk ${i + 1} failed:`, error.message);
      
      if (error.status === 429) {
        console.log(`[OpenAI PDF] Rate limit hit, waiting 10s and retrying chunk ${i + 1}...`);
        await sleep(10000);
        
        try {
          const base64Pdf = chunks[i].toString('base64');
          const retryResponse = await openai.chat.completions.create({
            model: 'gpt-4-turbo',
            messages: [
              { role: 'system', content: defaultSystem },
              {
                role: 'user',
                content: [
                  { type: 'text', text: prompt },
                  {
                    type: 'image_url',
                    image_url: {
                      url: `data:application/pdf;base64,${base64Pdf}`,
                      detail: 'high',
                    },
                  },
                ],
              },
            ],
            max_tokens: 4096,
            temperature: 0.1,
          });
          
          const analysis = retryResponse.choices[0]?.message?.content || '';
          chunkResults.push(`## ${chunkLabel}\n\n${analysis}`);
          console.log(`[OpenAI PDF] Retry successful for chunk ${i + 1}`);
        } catch (retryError: any) {
          console.error(`[OpenAI PDF] Retry also failed:`, retryError.message);
          chunkResults.push(`[Section ${chunkLabel}: Processing failed - ${retryError.message}]`);
        }
      } else {
        chunkResults.push(`[Section ${chunkLabel}: Processing failed - ${error.message}]`);
      }
    }
  }

  const combined = `# Document Analysis (${totalPages} pages, processed in ${chunks.length} sections via GPT-4 Turbo)\n\n` +
    chunkResults.join('\n\n---\n\n');

  console.log(`[OpenAI PDF] Complete - ${chunks.length} chunks processed`);
  
  return combined;
}
