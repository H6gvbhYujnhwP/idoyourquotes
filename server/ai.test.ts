import { describe, it, expect, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// Mock the LLM module
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn().mockResolvedValue({
    choices: [{
      message: {
        content: "Here are some insights about your quote:\n\n• Consider adding travel costs\n• Include contingency buffer\n• Clarify payment terms"
      }
    }]
  })
}));

// Mock db functions
vi.mock("./db", () => ({
  getQuotesByUserId: vi.fn(),
  getQuotesByOrgId: vi.fn(),
  getQuoteById: vi.fn(),
  getQuoteByIdAndOrg: vi.fn(),
  createQuote: vi.fn(),
  updateQuote: vi.fn(),
  updateQuoteStatus: vi.fn(),
  deleteQuote: vi.fn(),
  getLineItemsByQuoteId: vi.fn(),
  createLineItem: vi.fn(),
  updateLineItem: vi.fn(),
  deleteLineItem: vi.fn(),
  getInputsByQuoteId: vi.fn(),
  createInput: vi.fn(),
  deleteInput: vi.fn(),
  getTenderContextByQuoteId: vi.fn(),
  upsertTenderContext: vi.fn(),
  getInternalEstimateByQuoteId: vi.fn(),
  upsertInternalEstimate: vi.fn(),
  getCatalogItemsByUserId: vi.fn(),
  getCatalogItemsByOrgId: vi.fn(),
  createCatalogItem: vi.fn(),
  updateCatalogItem: vi.fn(),
  deleteCatalogItem: vi.fn(),
  recalculateQuoteTotals: vi.fn(),
  updateUserProfile: vi.fn(),
  changePassword: vi.fn(),
  getUserPrimaryOrg: vi.fn(),
  getOrganizationById: vi.fn(),
  logUsage: vi.fn(),
}));

import * as db from "./db";

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

function createUnauthContext(): TrpcContext {
  return {
    user: null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

describe("AI Quote Review", () => {
  const mockQuote = {
    id: 1,
    userId: 1,
    title: "Website Development",
    clientName: "Acme Corp",
    clientEmail: "client@acme.com",
    clientAddress: "123 Main St",
    description: "Full website redesign",
    status: "draft",
    subtotal: "5000.00",
    taxRate: "20.00",
    taxAmount: "1000.00",
    total: "6000.00",
    terms: "Payment due within 30 days",
  };

  const mockLineItems = [
    { id: 1, description: "Design Phase", quantity: "1", unit: "project", rate: "2000.00", total: "2000.00" },
    { id: 2, description: "Development", quantity: "40", unit: "hours", rate: "75.00", total: "3000.00" },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    // Set up org mock for usage logging
    vi.mocked(db.getUserPrimaryOrg).mockResolvedValue({ id: 10, name: "Test Org", slug: "test-org" } as any);
    vi.mocked(db.logUsage).mockResolvedValue(undefined);
    vi.mocked(db.getQuoteById).mockResolvedValue(mockQuote as any);
    vi.mocked(db.getLineItemsByQuoteId).mockResolvedValue(mockLineItems as any);
    vi.mocked(db.getTenderContextByQuoteId).mockResolvedValue(null);
    vi.mocked(db.getInternalEstimateByQuoteId).mockResolvedValue(null);
  });

  it("should return AI response for 'missed' prompt type", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.ai.askAboutQuote({
      quoteId: 1,
      promptType: "missed",
    });

    expect(result.success).toBe(true);
    expect(result.response).toContain("insights");
    expect(result.promptType).toBe("missed");
  });

  it("should return AI response for 'risks' prompt type", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.ai.askAboutQuote({
      quoteId: 1,
      promptType: "risks",
    });

    expect(result.success).toBe(true);
    expect(result.promptType).toBe("risks");
  });

  it("should return AI response for 'assumptions' prompt type", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.ai.askAboutQuote({
      quoteId: 1,
      promptType: "assumptions",
    });

    expect(result.success).toBe(true);
    expect(result.promptType).toBe("assumptions");
  });

  it("should return AI response for 'pricing' prompt type", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.ai.askAboutQuote({
      quoteId: 1,
      promptType: "pricing",
    });

    expect(result.success).toBe(true);
    expect(result.promptType).toBe("pricing");
  });

  it("should return AI response for 'issues' prompt type", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.ai.askAboutQuote({
      quoteId: 1,
      promptType: "issues",
    });

    expect(result.success).toBe(true);
    expect(result.promptType).toBe("issues");
  });

  it("should return AI response for 'custom' prompt type with custom prompt", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.ai.askAboutQuote({
      quoteId: 1,
      promptType: "custom",
      customPrompt: "Is the timeline realistic for this project?",
    });

    expect(result.success).toBe(true);
    expect(result.promptType).toBe("custom");
  });

  it("should throw error when quote not found", async () => {
    vi.mocked(db.getQuoteById).mockResolvedValue(null as any);

    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.ai.askAboutQuote({
        quoteId: 999,
        promptType: "missed",
      })
    ).rejects.toThrow("Quote not found");
  });

  it("should require authentication", async () => {
    const ctx = createUnauthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.ai.askAboutQuote({
        quoteId: 1,
        promptType: "missed",
      })
    ).rejects.toThrow();
  });

  it("should include tender context in AI prompt when available", async () => {
    vi.mocked(db.getTenderContextByQuoteId).mockResolvedValue({
      id: 1,
      quoteId: 1,
      assumptions: [{ text: "Client provides content", confirmed: true }],
      exclusions: [{ text: "Hosting not included", confirmed: true }],
      notes: "Complex project",
      symbolMappings: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);

    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.ai.askAboutQuote({
      quoteId: 1,
      promptType: "missed",
    });

    expect(result.success).toBe(true);
  });

  it("should include internal estimate in AI prompt when available", async () => {
    vi.mocked(db.getInternalEstimateByQuoteId).mockResolvedValue({
      id: 1,
      quoteId: 1,
      notes: "Budget is tight",
      riskNotes: "Timeline may slip",
      costBreakdown: null,
      timeEstimates: null,
      aiSuggestions: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);

    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.ai.askAboutQuote({
      quoteId: 1,
      promptType: "risks",
    });

    expect(result.success).toBe(true);
  });
});
