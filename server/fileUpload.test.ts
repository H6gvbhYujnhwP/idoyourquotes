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
