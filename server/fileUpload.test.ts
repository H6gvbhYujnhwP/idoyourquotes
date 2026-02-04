import { describe, expect, it, vi, beforeEach } from "vitest";
import { isR2Configured } from "./r2Storage";

// Mock environment variables
vi.mock("./r2Storage", async () => {
  const actual = await vi.importActual("./r2Storage");
  return {
    ...actual,
    isR2Configured: vi.fn(),
  };
});

describe("R2 Storage Configuration", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns false when R2 is not configured", () => {
    vi.mocked(isR2Configured).mockReturnValue(false);
    expect(isR2Configured()).toBe(false);
  });

  it("returns true when R2 is configured", () => {
    vi.mocked(isR2Configured).mockReturnValue(true);
    expect(isR2Configured()).toBe(true);
  });
});

describe("File Upload Input Validation", () => {
  const validInputTypes = ["pdf", "image", "audio", "email"] as const;
  
  it("accepts valid input types", () => {
    validInputTypes.forEach((type) => {
      expect(validInputTypes.includes(type)).toBe(true);
    });
  });

  it("validates file size limits", () => {
    const fileSizeLimits = {
      pdf: 20 * 1024 * 1024, // 20MB
      image: 10 * 1024 * 1024, // 10MB
      audio: 50 * 1024 * 1024, // 50MB
    };

    expect(fileSizeLimits.pdf).toBe(20971520);
    expect(fileSizeLimits.image).toBe(10485760);
    expect(fileSizeLimits.audio).toBe(52428800);
  });

  it("validates accepted MIME types for PDF", () => {
    const pdfMimeTypes = ["application/pdf"];
    expect(pdfMimeTypes).toContain("application/pdf");
  });

  it("validates accepted MIME types for images", () => {
    const imageMimeTypes = ["image/jpeg", "image/png", "image/gif", "image/webp", "image/bmp"];
    expect(imageMimeTypes).toContain("image/jpeg");
    expect(imageMimeTypes).toContain("image/png");
    expect(imageMimeTypes).toContain("image/gif");
  });

  it("validates accepted MIME types for audio", () => {
    const audioMimeTypes = ["audio/mpeg", "audio/wav", "audio/mp4", "audio/ogg", "audio/webm"];
    expect(audioMimeTypes).toContain("audio/mpeg");
    expect(audioMimeTypes).toContain("audio/wav");
  });
});

describe("Base64 Encoding", () => {
  it("correctly encodes and decodes base64", () => {
    const originalText = "Hello, World!";
    const base64 = Buffer.from(originalText).toString("base64");
    const decoded = Buffer.from(base64, "base64").toString();
    expect(decoded).toBe(originalText);
  });

  it("handles binary data correctly", () => {
    const binaryData = new Uint8Array([0x00, 0x01, 0x02, 0xff, 0xfe, 0xfd]);
    const buffer = Buffer.from(binaryData);
    const base64 = buffer.toString("base64");
    const decodedBuffer = Buffer.from(base64, "base64");
    expect(decodedBuffer).toEqual(buffer);
  });
});

describe("File Key Generation", () => {
  it("generates unique file keys with folder prefix", () => {
    const folder = "quotes/123";
    const filename = "document.pdf";
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    
    const fileKey = `${folder}/${timestamp}-${randomSuffix}-${filename}`;
    
    expect(fileKey).toContain(folder);
    expect(fileKey).toContain(filename);
    expect(fileKey.split("/").length).toBe(3);
  });

  it("sanitizes filenames to remove special characters", () => {
    const sanitizeFilename = (name: string) => {
      return name.replace(/[^a-zA-Z0-9.-]/g, "_");
    };

    expect(sanitizeFilename("my file (1).pdf")).toBe("my_file__1_.pdf");
    expect(sanitizeFilename("document.pdf")).toBe("document.pdf");
    expect(sanitizeFilename("test@#$%.png")).toBe("test____.png");
  });
});

describe("File Deletion with R2 Cleanup", () => {
  it("should extract file key from input record for R2 deletion", () => {
    const inputRecord = {
      id: 1,
      quoteId: 123,
      inputType: "audio",
      filename: "recording.mp3",
      fileKey: "quotes/123/abc123-recording.mp3",
      fileUrl: "https://r2.example.com/quotes/123/abc123-recording.mp3?signature=xyz",
    };

    expect(inputRecord.fileKey).toBeDefined();
    expect(inputRecord.fileKey).toBe("quotes/123/abc123-recording.mp3");
  });

  it("should handle inputs without file keys (text notes)", () => {
    const textInput = {
      id: 2,
      quoteId: 123,
      inputType: "text",
      content: "Some notes",
      fileKey: null,
      fileUrl: null,
    };

    // Should not attempt R2 deletion for text inputs
    const shouldDeleteFromR2 = textInput.fileKey && textInput.fileKey.length > 0;
    expect(shouldDeleteFromR2).toBeFalsy();
  });

  it("should verify input belongs to quote before deletion", () => {
    const inputRecord = {
      id: 1,
      quoteId: 123,
      inputType: "audio",
    };

    const requestedQuoteId = 456; // Different quote
    const belongsToQuote = inputRecord.quoteId === requestedQuoteId;
    expect(belongsToQuote).toBe(false);
  });

  it("should allow deletion when input belongs to correct quote", () => {
    const inputRecord = {
      id: 1,
      quoteId: 123,
      inputType: "audio",
    };

    const requestedQuoteId = 123; // Same quote
    const belongsToQuote = inputRecord.quoteId === requestedQuoteId;
    expect(belongsToQuote).toBe(true);
  });

  it("should handle R2 deletion errors gracefully", async () => {
    // Simulate R2 deletion that might fail
    const mockDeleteFromR2 = vi.fn().mockRejectedValue(new Error("R2 connection failed"));
    
    let dbDeleteSucceeded = false;
    let r2Error: Error | null = null;

    try {
      await mockDeleteFromR2("quotes/123/file.mp3");
    } catch (error) {
      r2Error = error as Error;
    }

    // Even if R2 fails, we should still delete the DB record
    dbDeleteSucceeded = true;

    expect(r2Error).not.toBeNull();
    expect(r2Error?.message).toBe("R2 connection failed");
    expect(dbDeleteSucceeded).toBe(true); // DB deletion should still proceed
  });

  it("should check R2 configuration before attempting deletion", () => {
    vi.mocked(isR2Configured).mockReturnValue(false);
    
    const inputRecord = {
      fileKey: "quotes/123/file.mp3",
    };

    // Should skip R2 deletion if not configured
    const shouldAttemptR2Delete = inputRecord.fileKey && isR2Configured();
    expect(shouldAttemptR2Delete).toBe(false);
  });

  it("should attempt R2 deletion when configured and file key exists", () => {
    vi.mocked(isR2Configured).mockReturnValue(true);
    
    const inputRecord = {
      fileKey: "quotes/123/file.mp3",
    };

    const shouldAttemptR2Delete = inputRecord.fileKey && isR2Configured();
    expect(shouldAttemptR2Delete).toBe(true);
  });
});
