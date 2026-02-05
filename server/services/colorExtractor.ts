/**
 * Pure JavaScript color extraction from images
 * No native dependencies required - uses sharp for image processing
 */

import sharp from 'sharp';

interface RGB {
  r: number;
  g: number;
  b: number;
}

interface ColorResult {
  primaryColor: string;
  secondaryColor: string;
}

/**
 * Convert RGB to hex color string
 */
function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(x => {
    const hex = Math.round(x).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  }).join('');
}

/**
 * Calculate color distance (Euclidean)
 */
function colorDistance(c1: RGB, c2: RGB): number {
  return Math.sqrt(
    Math.pow(c1.r - c2.r, 2) +
    Math.pow(c1.g - c2.g, 2) +
    Math.pow(c1.b - c2.b, 2)
  );
}

/**
 * Check if a color is too close to white or black (neutral)
 */
function isNeutralColor(color: RGB, threshold: number = 30): boolean {
  // Check if close to white
  const distToWhite = colorDistance(color, { r: 255, g: 255, b: 255 });
  // Check if close to black
  const distToBlack = colorDistance(color, { r: 0, g: 0, b: 0 });
  // Check if grayscale (r ≈ g ≈ b)
  const isGray = Math.abs(color.r - color.g) < 20 && 
                 Math.abs(color.g - color.b) < 20 && 
                 Math.abs(color.r - color.b) < 20;
  
  return distToWhite < threshold || distToBlack < threshold || isGray;
}

/**
 * Get color saturation (0-1)
 */
function getSaturation(color: RGB): number {
  const max = Math.max(color.r, color.g, color.b);
  const min = Math.min(color.r, color.g, color.b);
  if (max === 0) return 0;
  return (max - min) / max;
}

/**
 * Simple k-means clustering for color quantization
 */
function kMeansClustering(pixels: RGB[], k: number, iterations: number = 10): RGB[] {
  if (pixels.length === 0) return [];
  
  // Initialize centroids randomly from pixels
  const centroids: RGB[] = [];
  const step = Math.floor(pixels.length / k);
  for (let i = 0; i < k; i++) {
    centroids.push({ ...pixels[i * step] });
  }
  
  for (let iter = 0; iter < iterations; iter++) {
    // Assign pixels to nearest centroid
    const clusters: RGB[][] = Array.from({ length: k }, () => []);
    
    for (const pixel of pixels) {
      let minDist = Infinity;
      let closestIdx = 0;
      
      for (let i = 0; i < k; i++) {
        const dist = colorDistance(pixel, centroids[i]);
        if (dist < minDist) {
          minDist = dist;
          closestIdx = i;
        }
      }
      
      clusters[closestIdx].push(pixel);
    }
    
    // Update centroids
    for (let i = 0; i < k; i++) {
      if (clusters[i].length > 0) {
        centroids[i] = {
          r: clusters[i].reduce((sum, p) => sum + p.r, 0) / clusters[i].length,
          g: clusters[i].reduce((sum, p) => sum + p.g, 0) / clusters[i].length,
          b: clusters[i].reduce((sum, p) => sum + p.b, 0) / clusters[i].length,
        };
      }
    }
  }
  
  return centroids;
}

/**
 * Extract dominant colors from an image buffer
 * Returns primary and secondary brand colors
 */
export async function extractBrandColors(imageBuffer: Buffer): Promise<ColorResult> {
  try {
    // Resize image to speed up processing and get raw pixel data
    const { data, info } = await sharp(imageBuffer)
      .resize(100, 100, { fit: 'inside' })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    
    // Convert raw buffer to RGB pixels
    const pixels: RGB[] = [];
    for (let i = 0; i < data.length; i += 3) {
      const pixel = {
        r: data[i],
        g: data[i + 1],
        b: data[i + 2],
      };
      
      // Skip very neutral colors (white, black, gray backgrounds)
      if (!isNeutralColor(pixel)) {
        pixels.push(pixel);
      }
    }
    
    // If no colorful pixels found, return default colors
    if (pixels.length < 10) {
      console.log('[colorExtractor] Not enough colorful pixels, using defaults');
      return {
        primaryColor: '#2563eb', // Blue
        secondaryColor: '#1e40af', // Darker blue
      };
    }
    
    // Run k-means clustering to find dominant colors
    const dominantColors = kMeansClustering(pixels, 5, 15);
    
    // Sort by saturation (more saturated = more likely brand color)
    const sortedColors = dominantColors
      .filter(c => !isNeutralColor(c, 50))
      .sort((a, b) => getSaturation(b) - getSaturation(a));
    
    if (sortedColors.length === 0) {
      console.log('[colorExtractor] No saturated colors found, using defaults');
      return {
        primaryColor: '#2563eb',
        secondaryColor: '#1e40af',
      };
    }
    
    // Primary color is the most saturated
    const primary = sortedColors[0];
    const primaryHex = rgbToHex(primary.r, primary.g, primary.b);
    
    // Secondary color: find a different color, or darken the primary
    let secondaryHex: string;
    if (sortedColors.length > 1) {
      // Find a color that's different enough from primary
      const secondary = sortedColors.find(c => colorDistance(c, primary) > 50) || sortedColors[1];
      secondaryHex = rgbToHex(secondary.r, secondary.g, secondary.b);
    } else {
      // Darken the primary color for secondary
      secondaryHex = rgbToHex(
        Math.max(0, primary.r * 0.7),
        Math.max(0, primary.g * 0.7),
        Math.max(0, primary.b * 0.7)
      );
    }
    
    console.log('[colorExtractor] Extracted colors:', { primaryHex, secondaryHex });
    
    return {
      primaryColor: primaryHex,
      secondaryColor: secondaryHex,
    };
  } catch (error) {
    console.error('[colorExtractor] Error extracting colors:', error);
    // Return default colors on error
    return {
      primaryColor: '#2563eb',
      secondaryColor: '#1e40af',
    };
  }
}
