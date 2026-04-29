// Minimal Claude API client for the standalone proof script.
//
// We deliberately do NOT import from server/_core/claude.ts. The proof
// must be standalone — runnable from the Render shell without spinning
// up the app's tRPC stack, env loader, or DB pool. This file is a tiny
// fetch wrapper that reads ANTHROPIC_API_KEY from the existing Render
// environment and calls the Anthropic Messages API directly.
//
// Temperature defaults to 0.1 — same posture as the app's invokeClaude,
// for the same reason: we want repeatable runs of the same evidence
// during proof evaluation.

export interface ClaudeCall {
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
}

export interface ClaudeResponse {
  text: string;
  inputTokens: number;
  outputTokens: number;
}

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-20250514";

export async function callClaude(call: ClaudeCall): Promise<ClaudeResponse> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY not found in environment. " +
      "On Render, this is set in Settings → Environment.",
    );
  }

  const body = {
    model: MODEL,
    max_tokens: call.maxTokens ?? 4096,
    temperature: call.temperature ?? 0.1,
    system: call.system,
    messages: [{ role: "user", content: call.user }],
  };

  const response = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Anthropic API error ${response.status}: ${errorText.slice(0, 500)}`,
    );
  }

  const data: any = await response.json();

  // Defensive parse — content is an array of blocks, we want the first text block
  const textBlock = (data.content ?? []).find((b: any) => b.type === "text");
  if (!textBlock || typeof textBlock.text !== "string") {
    throw new Error(
      `Unexpected Claude response shape: ${JSON.stringify(data).slice(0, 500)}`,
    );
  }

  return {
    text: textBlock.text,
    inputTokens: data.usage?.input_tokens ?? 0,
    outputTokens: data.usage?.output_tokens ?? 0,
  };
}

/**
 * Extract a JSON object from a Claude response. Handles the common cases:
 * - Pure JSON (ideal — what we ask for)
 * - JSON wrapped in ```json ... ``` fences
 * - JSON with a leading prose preamble we can strip past the first {
 *
 * Throws if no parseable JSON is found.
 */
export function extractJson<T = any>(text: string): T {
  // Strip code fences if present
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
  }

  // Try parsing as-is first
  try {
    return JSON.parse(cleaned);
  } catch {
    // Fall through to bracket-matching recovery
  }

  // Find the first { or [ and the matching last } or ]
  const firstBrace = Math.min(
    ...["{", "["].map((c) => {
      const idx = cleaned.indexOf(c);
      return idx === -1 ? Infinity : idx;
    }),
  );
  if (!isFinite(firstBrace)) {
    throw new Error(`No JSON found in response: ${text.slice(0, 200)}`);
  }
  const lastBrace = Math.max(cleaned.lastIndexOf("}"), cleaned.lastIndexOf("]"));
  if (lastBrace <= firstBrace) {
    throw new Error(`Malformed JSON in response: ${text.slice(0, 200)}`);
  }
  const candidate = cleaned.slice(firstBrace, lastBrace + 1);
  try {
    return JSON.parse(candidate);
  } catch (err) {
    throw new Error(
      `Failed to parse JSON. Candidate: ${candidate.slice(0, 200)}. Error: ${(err as Error).message}`,
    );
  }
}
