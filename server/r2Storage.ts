// Cloudflare R2 Storage Helper
// Uses AWS S3 SDK with R2-compatible endpoint

import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { nanoid } from "nanoid";

// R2 Configuration from environment variables
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || "";
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || "";
const R2_ENDPOINT = process.env.R2_ENDPOINT || "";
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || "idoyourquotes-uploads";

// Initialize S3 client for R2
let s3Client: S3Client | null = null;

function getS3Client(): S3Client {
  if (!s3Client) {
    if (!R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_ENDPOINT) {
      throw new Error("R2 storage credentials not configured. Set R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_ENDPOINT environment variables.");
    }
    
    s3Client = new S3Client({
      region: "auto",
      endpoint: R2_ENDPOINT,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
      },
    });
  }
  return s3Client;
}

/**
 * Upload a file to R2 storage
 * @param data - File buffer or string content
 * @param filename - Original filename
 * @param contentType - MIME type of the file
 * @param folder - Optional folder path (e.g., "quotes/123")
 * @returns Object with key and public URL
 */
export async function uploadToR2(
  data: Buffer | Uint8Array | string,
  filename: string,
  contentType: string,
  folder?: string
): Promise<{ key: string; url: string }> {
  const client = getS3Client();
  
  // Generate unique key with folder structure
  const uniqueId = nanoid(10);
  const sanitizedFilename = filename.replace(/[^a-zA-Z0-9.-]/g, "_");
  const key = folder 
    ? `${folder}/${uniqueId}-${sanitizedFilename}`
    : `${uniqueId}-${sanitizedFilename}`;
  
  // Convert string to buffer if needed
  const body = typeof data === "string" ? Buffer.from(data) : data;
  
  const command = new PutObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
    Body: body,
    ContentType: contentType,
  });
  
  await client.send(command);
  
  // Generate a presigned URL for access (valid for 7 days)
  const url = await getPresignedUrl(key);
  
  return { key, url };
}

/**
 * Get a presigned URL for downloading a file
 * @param key - The file key in R2
 * @param expiresIn - URL expiration time in seconds (default: 7 days)
 * @returns Presigned URL
 */
export async function getPresignedUrl(key: string, expiresIn: number = 604800): Promise<string> {
  const client = getS3Client();
  
  const command = new GetObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
  });
  
  return getSignedUrl(client, command, { expiresIn });
}

/**
 * Delete a file from R2 storage
 * @param key - The file key to delete
 */
export async function deleteFromR2(key: string): Promise<void> {
  const client = getS3Client();
  
  const command = new DeleteObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
  });
  
  await client.send(command);
}

/**
 * Check if R2 storage is configured
 */
export function isR2Configured(): boolean {
  return !!(R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_ENDPOINT);
}
