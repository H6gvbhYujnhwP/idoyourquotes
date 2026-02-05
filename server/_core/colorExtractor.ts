/**
 * Color Extraction Utility
 * Extracts dominant colors from logo images for brand consistency
 */

import ColorThief from 'color-thief-node';

interface BrandColors {
  primaryColor: string;
  secondaryColor: string;
}

/**
 * Convert RGB array to hex color string
 */
function rgbToHex(rgb: number[]): string {
  return '#' + rgb.map(x => {
    const hex = x.toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  }).join('');
}

/**
 * Calculate relative luminance of a color (for contrast checking)
 */
function getLuminance(rgb: number[]): number {
  const [r, g, b] = rgb.map(c => {
    c = c / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Check if a color is too light (close to white) or too dark (close to black)
 */
function isUsableColor(rgb: number[]): boolean {
  const luminance = getLuminance(rgb);
  // Exclude very light colors (luminance > 0.9) and very dark colors (luminance < 0.1)
  return luminance > 0.05 && luminance < 0.95;
}

/**
 * Extract brand colors from a logo image buffer
 * Returns primary and secondary colors in hex format
 */
export async function extractBrandColors(imageBuffer: Buffer): Promise<BrandColors> {
  try {
    // Get dominant color
    const dominantColor = await ColorThief.getColor(imageBuffer);
    
    // Get color palette (top 5 colors)
    const palette = await ColorThief.getPalette(imageBuffer, 5);
    
    // Find the best primary color (most prominent usable color)
    let primaryRgb: number[] = dominantColor;
    if (!isUsableColor(dominantColor) && palette.length > 0) {
      // If dominant color is too light/dark, find first usable color from palette
      const usableColor = palette.find((color: number[]) => isUsableColor(color));
      if (usableColor) {
        primaryRgb = usableColor;
      }
    }
    
    // Find secondary color (different from primary, usable)
    let secondaryRgb: number[] | undefined = palette.find((color: number[]) => {
      if (!isUsableColor(color)) return false;
      // Make sure it's different enough from primary
      const diff = Math.abs(color[0] - primaryRgb[0]) + 
                   Math.abs(color[1] - primaryRgb[1]) + 
                   Math.abs(color[2] - primaryRgb[2]);
      return diff > 50; // At least some color difference
    });
    
    // If no good secondary found, darken/lighten the primary
    if (!secondaryRgb) {
      const luminance = getLuminance(primaryRgb);
      if (luminance > 0.5) {
        // Primary is light, make secondary darker
        secondaryRgb = primaryRgb.map((c: number) => Math.max(0, Math.floor(c * 0.7)));
      } else {
        // Primary is dark, make secondary lighter
        secondaryRgb = primaryRgb.map((c: number) => Math.min(255, Math.floor(c * 1.3 + 30)));
      }
    }
    
    return {
      primaryColor: rgbToHex(primaryRgb),
      secondaryColor: rgbToHex(secondaryRgb)
    };
  } catch (error) {
    console.error('[colorExtractor] Error extracting colors:', error);
    // Return default teal colors if extraction fails
    return {
      primaryColor: '#0d6e6e',
      secondaryColor: '#0a5555'
    };
  }
}

/**
 * Extract brand colors from a URL (fetches image first)
 */
export async function extractBrandColorsFromUrl(imageUrl: string): Promise<BrandColors> {
  try {
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    return extractBrandColors(buffer);
  } catch (error) {
    console.error('[colorExtractor] Error fetching image from URL:', error);
    return {
      primaryColor: '#0d6e6e',
      secondaryColor: '#0a5555'
    };
  }
}
