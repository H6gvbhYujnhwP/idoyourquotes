/**
 * Web Scraper Utility
 * Fetches and extracts content from URLs for quote analysis
 */

import * as cheerio from "cheerio";

export interface ScrapedContent {
  url: string;
  title: string;
  description: string;
  content: string;
  error?: string;
}

/**
 * Extract URLs from text
 */
export function extractUrls(text: string): string[] {
  const urlRegex = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/gi;
  const matches = text.match(urlRegex) || [];
  // Remove duplicates and clean up trailing punctuation
  const cleaned = matches.map(url => url.replace(/[.,;:!?)]+$/, ""));
  return Array.from(new Set(cleaned));
}

/**
 * Scrape content from a single URL
 */
export async function scrapeUrl(url: string): Promise<ScrapedContent> {
  try {
    // Validate URL
    const parsedUrl = new URL(url);
    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      return {
        url,
        title: "",
        description: "",
        content: "",
        error: "Invalid URL protocol",
      };
    }

    // Fetch the page with timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000); // 15 second timeout

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; IdoYourQuotes/1.0; +https://idoyourquotes.com)",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
      },
    });

    clearTimeout(timeout);

    if (!response.ok) {
      return {
        url,
        title: "",
        description: "",
        content: "",
        error: `HTTP ${response.status}: ${response.statusText}`,
      };
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
      return {
        url,
        title: "",
        description: "",
        content: "",
        error: "Not an HTML page",
      };
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // Remove script, style, nav, footer, and other non-content elements
    $("script, style, nav, footer, header, aside, iframe, noscript, svg, form").remove();
    $("[role='navigation'], [role='banner'], [role='contentinfo']").remove();
    $(".nav, .navbar, .menu, .sidebar, .footer, .header, .advertisement, .ad, .cookie").remove();

    // Extract title
    const title = $("title").text().trim() || 
                  $("h1").first().text().trim() || 
                  $('meta[property="og:title"]').attr("content") || 
                  "";

    // Extract description
    const description = $('meta[name="description"]').attr("content") || 
                        $('meta[property="og:description"]').attr("content") || 
                        "";

    // Extract main content
    let content = "";

    // Try to find main content area
    const mainSelectors = [
      "main",
      "article",
      '[role="main"]',
      ".content",
      ".main-content",
      "#content",
      "#main",
      ".post-content",
      ".entry-content",
    ];

    for (const selector of mainSelectors) {
      const mainContent = $(selector).first();
      if (mainContent.length > 0) {
        content = mainContent.text().trim();
        break;
      }
    }

    // Fallback to body if no main content found
    if (!content) {
      content = $("body").text().trim();
    }

    // Clean up whitespace
    content = content
      .replace(/\s+/g, " ")
      .replace(/\n\s*\n/g, "\n\n")
      .trim();

    // Limit content length (max 10000 chars)
    if (content.length > 10000) {
      content = content.substring(0, 10000) + "...";
    }

    return {
      url,
      title,
      description,
      content,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return {
      url,
      title: "",
      description: "",
      content: "",
      error: errorMessage.includes("abort") ? "Request timed out" : errorMessage,
    };
  }
}

/**
 * Scrape multiple URLs and combine content
 */
export async function scrapeUrls(urls: string[]): Promise<ScrapedContent[]> {
  // Limit to 5 URLs max to avoid abuse
  const limitedUrls = urls.slice(0, 5);
  
  const results = await Promise.all(
    limitedUrls.map(url => scrapeUrl(url))
  );

  return results;
}

/**
 * Format scraped content for AI analysis
 */
export function formatScrapedContentForAI(scrapedContent: ScrapedContent[]): string {
  const successfulScrapes = scrapedContent.filter(s => !s.error && s.content);
  
  if (successfulScrapes.length === 0) {
    return "";
  }

  let formatted = "\n\n--- WEBSITE CONTENT ---\n";
  
  for (const scraped of successfulScrapes) {
    formatted += `\n**Source:** ${scraped.url}\n`;
    if (scraped.title) {
      formatted += `**Title:** ${scraped.title}\n`;
    }
    if (scraped.description) {
      formatted += `**Description:** ${scraped.description}\n`;
    }
    formatted += `**Content:**\n${scraped.content}\n`;
    formatted += "\n---\n";
  }

  return formatted;
}
