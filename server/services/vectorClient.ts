/**
 * Vector Extraction Client
 * Calls the Python microservice to extract tray line paths from PDFs.
 * Completely non-fatal — returns null on any error so the existing
 * annotation-based length estimation continues to work.
 */

const VECTOR_SERVICE_URL = process.env.VECTOR_SERVICE_URL || 'http://localhost:5050';
const TIMEOUT_MS = 30_000; // 30 seconds max

export interface VectorSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  length_metres: number;
}

export interface VectorRun {
  colour: string;
  total_length_metres: number;
  total_length_pdf_units: number;
  segment_count: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
  midpoint: { x: number; y: number };
  segments: VectorSegment[];
}

export interface VectorExtractionResult {
  page_width: number;
  page_height: number;
  scale: string;
  paper_size: string;
  metres_per_pdf_unit: number;
  total_coloured_paths: number;
  runs: VectorRun[];
  colour_summary: Record<string, { run_count: number; total_length_metres: number }>;
}

/**
 * Extract vector tray lines from a PDF buffer.
 * Returns null if the service is unavailable or fails.
 */
export async function extractVectorLines(
  pdfBuffer: Buffer,
  options?: { scale?: string; paperSize?: string; page?: number }
): Promise<VectorExtractionResult | null> {
  try {
    // Check if service URL is configured
    if (!VECTOR_SERVICE_URL) {
      console.log('[Vector Client] VECTOR_SERVICE_URL not configured, skipping');
      return null;
    }

    // Build query string
    const params = new URLSearchParams();
    if (options?.scale) params.set('scale', options.scale.replace('1:', ''));
    if (options?.paperSize) params.set('paper_size', options.paperSize);
    if (options?.page) params.set('page', String(options.page));

    const url = `${VECTOR_SERVICE_URL}/extract?${params.toString()}`;

    // Build multipart form data
    const boundary = '----VectorExtraction' + Date.now();
    const bodyParts: Buffer[] = [];

    // Add PDF file part
    bodyParts.push(Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="pdf"; filename="drawing.pdf"\r\n` +
      `Content-Type: application/pdf\r\n\r\n`
    ));
    bodyParts.push(pdfBuffer);
    bodyParts.push(Buffer.from(`\r\n--${boundary}--\r\n`));

    const body = Buffer.concat(bodyParts);

    // Make request with timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': String(body.length),
        },
        body,
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const errorText = await response.text();
        console.log(`[Vector Client] Service returned ${response.status}: ${errorText}`);
        return null;
      }

      const result: VectorExtractionResult = await response.json();

      console.log(`[Vector Client] Extracted ${result.total_coloured_paths} paths → ${result.runs.length} runs`);
      for (const [colour, summary] of Object.entries(result.colour_summary)) {
        console.log(`[Vector Client]   ${colour}: ${summary.run_count} runs, ${summary.total_length_metres}m total`);
      }

      return result;
    } finally {
      clearTimeout(timeout);
    }
  } catch (err: any) {
    if (err.name === 'AbortError') {
      console.log('[Vector Client] Request timed out after 30s, skipping');
    } else {
      console.log(`[Vector Client] Service unavailable (non-fatal): ${err.message}`);
    }
    return null;
  }
}

/**
 * Check if the vector service is reachable.
 */
export async function isVectorServiceAvailable(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const response = await fetch(`${VECTOR_SERVICE_URL}/health`, { signal: controller.signal });
    clearTimeout(timeout);
    return response.ok;
  } catch {
    return false;
  }
}
