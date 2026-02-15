
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
