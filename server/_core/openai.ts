/**
 * OpenAI API Client
 * Used for faster PDF analysis with higher rate limits than Claude
 */

import OpenAI from 'openai';

// Initialize OpenAI client using existing environment variable
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export { openai };

/**
 * Check if OpenAI API is configured
 */
export function isOpenAIConfigured(): boolean {
  return !!process.env.OPENAI_API_KEY;
}

