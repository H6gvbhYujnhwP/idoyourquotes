import { describe, it, expect, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// Mock the database functions
vi.mock("./db", () => ({
  upsertTenderContext: vi.fn(),
  getQuotesByUserId: vi.fn(),
  getQuotesByOrgId: vi.fn(),
  getQuoteById: vi.fn(),
  getQuoteByIdAndOrg: vi.fn(),
  createQuote: vi.fn(),
  updateQuote: vi.fn(),
  deleteQuote: vi.fn(),
  getLineItemsByQuoteId: vi.fn(),
  createLineItem: vi.fn(),
  updateLineItem: vi.fn(),
  deleteLineItem: vi.fn(),
  deleteLineItemsByQuoteId: vi.fn(),
  getInputsByQuoteId: vi.fn(),
  getInputById: vi.fn(),
  createInput: vi.fn(),
  deleteInput: vi.fn(),
  updateInputProcessing: vi.fn(),
  getTenderContextByQuoteId: vi.fn(),
  getInternalEstimateByQuoteId: vi.fn(),
  upsertInternalEstimate: vi.fn(),
  getCatalogItemsByUserId: vi.fn(),
  getCatalogItemsByOrgId: vi.fn(),
  createCatalogItem: vi.fn(),
  updateCatalogItem: vi.fn(),
  deleteCatalogItem: vi.fn(),
  recalculateQuoteTotals: vi.fn(),
  updateQuoteStatus: vi.fn(),
  getUserById: vi.fn(),
  updateUserProfile: vi.fn(),
  getUserPrimaryOrg: vi.fn(),
  getOrganizationById: vi.fn(),
  logUsage: vi.fn(),
}));

// Mock the voice transcription
vi.mock("./_core/voiceTranscription", () => ({
  transcribeAudio: vi.fn(),
}));

// Mock the LLM
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn(),
}));

import * as db from "./db";
import { transcribeAudio } from "./_core/voiceTranscription";
import { invokeLLM } from "./_core/llm";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-user-123",
    email: "test@example.com",
    name: "Test User",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  return {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

describe("AI Input Processing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("inputs.transcribeAudio", () => {
    it("transcribes audio and updates input with processed content", async () => {
      const mockOrg = { id: 10, name: "Test Org", slug: "test-org" };
      const mockInput = {
        id: 1,
        quoteId: 1,
        inputType: "audio",
        fileUrl: "https://storage.example.com/audio.mp3",
        filename: "recording.mp3",
        mimeType: "audio/mpeg",
        createdAt: new Date(),
      };
      
      const mockQuote = {
        id: 1,
        userId: 1,
        orgId: 10,
        title: "Test Quote",
        status: "draft",
      };

      vi.mocked(db.getUserPrimaryOrg).mockResolvedValue(mockOrg as any);
      vi.mocked(db.logUsage).mockResolvedValue(undefined);
      vi.mocked(db.getInputById).mockResolvedValue(mockInput as any);
      vi.mocked(db.getQuoteById).mockResolvedValue(mockQuote as any);
      vi.mocked(transcribeAudio).mockResolvedValue({
        text: "Hello, I need a quote for painting my house.",
        language: "en",
        segments: [],
      } as any);
      vi.mocked(db.updateInputProcessing).mockResolvedValue(undefined);

      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.inputs.transcribeAudio({ inputId: 1, quoteId: 1 });

      expect(db.getInputById).toHaveBeenCalledWith(1);
      expect(transcribeAudio).toHaveBeenCalledWith({
        audioUrl: "https://storage.example.com/audio.mp3",
      });
      // Check that updateInputProcessing was called with completed status
      expect(db.updateInputProcessing).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          processingStatus: "completed",
          processedContent: "Hello, I need a quote for painting my house.",
        })
      );
      expect(result.transcription).toBe("Hello, I need a quote for painting my house.");
    });

    it("handles transcription failure gracefully", async () => {
      const mockInput = {
        id: 1,
        quoteId: 1,
        inputType: "audio",
        fileUrl: "https://storage.example.com/audio.mp3",
        filename: "recording.mp3",
        mimeType: "audio/mpeg",
        createdAt: new Date(),
      };
      
      const mockQuote = {
        id: 1,
        userId: 1,
        title: "Test Quote",
        status: "draft",
      };

      vi.mocked(db.getInputById).mockResolvedValue(mockInput as any);
      vi.mocked(db.getQuoteById).mockResolvedValue(mockQuote as any);
      vi.mocked(transcribeAudio).mockRejectedValue(new Error("Transcription service unavailable"));

      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      await expect(caller.inputs.transcribeAudio({ inputId: 1, quoteId: 1 }))
        .rejects.toThrow();

      expect(db.updateInputProcessing).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          processingStatus: "failed",
          processingError: expect.stringContaining("unavailable"),
        })
      );
    });

    it("rejects if input not found", async () => {
      vi.mocked(db.getInputById).mockResolvedValue(undefined);

      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      await expect(caller.inputs.transcribeAudio({ inputId: 999, quoteId: 1 }))
        .rejects.toThrow("Input not found");
    });
  });

  describe("inputs.analyzeImage", () => {
    it("analyzes image using vision and updates input", async () => {
      const mockOrg = { id: 10, name: "Test Org", slug: "test-org" };
      const mockInput = {
        id: 2,
        quoteId: 1,
        inputType: "image",
        fileUrl: "https://storage.example.com/drawing.jpg",
        filename: "floor-plan.jpg",
        mimeType: "image/jpeg",
        createdAt: new Date(),
      };
      
      const mockQuote = {
        id: 1,
        userId: 1,
        orgId: 10,
        title: "Test Quote",
        status: "draft",
      };

      vi.mocked(db.getUserPrimaryOrg).mockResolvedValue(mockOrg as any);
      vi.mocked(db.logUsage).mockResolvedValue(undefined);
      vi.mocked(db.getInputById).mockResolvedValue(mockInput as any);
      vi.mocked(db.getQuoteById).mockResolvedValue(mockQuote as any);
      vi.mocked(invokeLLM).mockResolvedValue({
        choices: [{
          message: {
            content: "This is a floor plan showing 3 bedrooms, 2 bathrooms, and a living area. Approximate total area: 1500 sq ft."
          }
        }]
      } as any);
      vi.mocked(db.updateInputProcessing).mockResolvedValue(undefined);

      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.inputs.analyzeImage({ inputId: 2, quoteId: 1 });

      expect(db.getInputById).toHaveBeenCalledWith(2);
      expect(invokeLLM).toHaveBeenCalled();
      expect(db.updateInputProcessing).toHaveBeenCalledWith(
        2,
        expect.objectContaining({
          processingStatus: "completed",
          processedContent: expect.stringContaining("floor plan"),
        })
      );
      expect(result.analysis).toContain("floor plan");
    });
  });

  describe("ai.generateDraft", () => {
    it("generates a draft quote from processed inputs", async () => {
      const mockOrg = { id: 10, name: "Test Org", slug: "test-org" };
      const mockQuote = {
        id: 1,
        userId: 1,
        orgId: 10,
        title: "",
        clientName: "",
        description: "",
        status: "draft",
      };
      
      const mockInputs = [
        {
          id: 1,
          inputType: "audio",
          processedContent: "Client wants to paint 3 rooms. Budget around £500.",
          processingStatus: "completed",
        },
        {
          id: 2,
          inputType: "text",
          content: "Additional note: Client prefers eco-friendly paint.",
        },
      ];

      const mockDraftResponse = {
        clientName: "Client",
        title: "Interior Painting - 3 Rooms",
        description: "Professional painting service for 3 rooms using eco-friendly paint.",
        lineItems: [
          { description: "Room 1 - Painting", quantity: 1, unit: "room", rate: 150 },
          { description: "Room 2 - Painting", quantity: 1, unit: "room", rate: 150 },
          { description: "Room 3 - Painting", quantity: 1, unit: "room", rate: 150 },
        ],
        assumptions: ["Standard room size assumed", "Price includes labor and materials"],
        exclusions: [],
        riskNotes: "Additional prep work may be needed if walls are damaged.",
      };

      vi.mocked(db.getUserPrimaryOrg).mockResolvedValue(mockOrg as any);
      vi.mocked(db.logUsage).mockResolvedValue(undefined);
      vi.mocked(db.getQuoteById).mockResolvedValue(mockQuote as any);
      vi.mocked(db.getInputsByQuoteId).mockResolvedValue(mockInputs as any);
      vi.mocked(db.getLineItemsByQuoteId).mockResolvedValue([]);
      vi.mocked(db.getTenderContextByQuoteId).mockResolvedValue(null);
      vi.mocked(db.getInternalEstimateByQuoteId).mockResolvedValue(null);
      vi.mocked(db.getCatalogItemsByUserId).mockResolvedValue([]);
      vi.mocked(invokeLLM).mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify(mockDraftResponse)
          }
        }]
      } as any);
      vi.mocked(db.updateQuote).mockResolvedValue(mockQuote as any);
      vi.mocked(db.createLineItem).mockResolvedValue({ id: 1 } as any);
      vi.mocked(db.upsertTenderContext).mockResolvedValue(undefined);
      vi.mocked(db.upsertInternalEstimate).mockResolvedValue(undefined);
      vi.mocked(db.recalculateQuoteTotals).mockResolvedValue(undefined);

      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.ai.generateDraft({ quoteId: 1 });

      expect(db.getQuoteById).toHaveBeenCalledWith(1, 1);
      expect(db.getInputsByQuoteId).toHaveBeenCalledWith(1);
      expect(invokeLLM).toHaveBeenCalled();
      expect(db.updateQuote).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    it("includes user prompt in the generation", async () => {
      const mockOrg = { id: 10, name: "Test Org", slug: "test-org" };
      const mockQuote = {
        id: 1,
        userId: 1,
        orgId: 10,
        title: "",
        status: "draft",
      };
      
      const mockInputs = [
        {
          id: 1,
          inputType: "text",
          content: "Basic requirements",
        },
      ];

      const mockDraftResponse = {
        clientName: "John Smith",
        title: "Painting Quote",
        description: "Painting service",
        lineItems: [],
        assumptions: [],
        exclusions: [],
        riskNotes: "",
      };

      vi.mocked(db.getUserPrimaryOrg).mockResolvedValue(mockOrg as any);
      vi.mocked(db.logUsage).mockResolvedValue(undefined);
      vi.mocked(db.getQuoteById).mockResolvedValue(mockQuote as any);
      vi.mocked(db.getInputsByQuoteId).mockResolvedValue(mockInputs as any);
      vi.mocked(db.getLineItemsByQuoteId).mockResolvedValue([]);
      vi.mocked(db.getTenderContextByQuoteId).mockResolvedValue(null);
      vi.mocked(db.getInternalEstimateByQuoteId).mockResolvedValue(null);
      vi.mocked(db.getCatalogItemsByUserId).mockResolvedValue([]);
      vi.mocked(invokeLLM).mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify(mockDraftResponse)
          }
        }]
      } as any);
      vi.mocked(db.updateQuote).mockResolvedValue(mockQuote as any);
      vi.mocked(db.upsertInternalEstimate).mockResolvedValue(undefined);
      vi.mocked(db.recalculateQuoteTotals).mockResolvedValue(undefined);

      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      await caller.ai.generateDraft({ 
        quoteId: 1, 
        userPrompt: "Client email: Hi, I'm John Smith and need painting done ASAP." 
      });

      // Check that the LLM was called with the user prompt included
      expect(invokeLLM).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({
              content: expect.stringContaining("John Smith")
            })
          ])
        })
      );
    });

    it("rejects if quote not found or unauthorized", async () => {
      vi.mocked(db.getQuoteById).mockResolvedValue(undefined);

      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      await expect(caller.ai.generateDraft({ quoteId: 999 }))
        .rejects.toThrow("Quote not found");
    });
  });
});
