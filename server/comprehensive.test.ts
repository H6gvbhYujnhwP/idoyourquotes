import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// Mock the database functions
vi.mock("./db", () => ({
  getQuotesByUserId: vi.fn(),
  getQuotesByOrgId: vi.fn(),
  getQuoteById: vi.fn(),
  getQuoteByIdAndOrg: vi.fn(),
  createQuote: vi.fn(),
  updateQuote: vi.fn(),
  deleteQuote: vi.fn(),
  duplicateQuote: vi.fn(),
  getLineItemsByQuoteId: vi.fn(),
  createLineItem: vi.fn(),
  updateLineItem: vi.fn(),
  deleteLineItem: vi.fn(),
  getInputsByQuoteId: vi.fn(),
  getInputById: vi.fn(),
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

describe("Comprehensive Quotes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.getUserPrimaryOrg).mockResolvedValue({ id: 1, name: "Test Org", slug: "test-org" } as any);
    vi.mocked(db.getQuoteByIdAndOrg).mockResolvedValue(null);
  });

  describe("quotes.getTradePresets", () => {
    it("returns all available trade presets", async () => {
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);
      const presets = await caller.quotes.getTradePresets();

      expect(presets).toBeInstanceOf(Array);
      expect(presets.length).toBeGreaterThanOrEqual(4);

      const keys = presets.map((p) => p.key);
      expect(keys).toContain("construction");
      expect(keys).toContain("electrical");
      expect(keys).toContain("metalwork");
      expect(keys).toContain("custom");

      // Each preset should have name and description
      for (const preset of presets) {
        expect(preset.name).toBeTruthy();
        expect(preset.description).toBeTruthy();
      }
    });
  });

  describe("quotes.create with comprehensive mode", () => {
    it("creates a comprehensive quote with trade preset", async () => {
      const mockQuote = {
        id: 1,
        userId: 1,
        orgId: 1,
        title: "Steel Fabrication Project",
        reference: "Q-123",
        status: "draft",
        quoteMode: "comprehensive",
        tradePreset: "metalwork_fabrication",
        comprehensiveConfig: {
          sections: {
            coverLetter: { enabled: true },
            tradeBill: { enabled: true, format: "table" },
            reviewForms: { enabled: false, templates: [] },
            technicalReview: { enabled: true },
            drawings: { enabled: true, categories: ["shop_drawings", "as_built_drawings"] },
            supportingDocs: { enabled: true, categories: ["material_certs", "weld_procedures"] },
            siteRequirements: { enabled: true },
            qualityCompliance: { enabled: true },
          },
        },
      };

      vi.mocked(db.createQuote).mockResolvedValue(mockQuote as any);

      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);
      const result = await caller.quotes.create({
        title: "Steel Fabrication Project",
        quoteMode: "comprehensive",
        tradePreset: "metalwork",
      });

      expect(result.quoteMode).toBe("comprehensive");
      expect(result.tradePreset).toBe("metalwork_fabrication");
      expect(db.createQuote).toHaveBeenCalledWith(
        expect.objectContaining({
          quoteMode: "comprehensive",
          tradePreset: "metalwork",
          comprehensiveConfig: expect.objectContaining({
            sections: expect.any(Object),
          }),
        })
      );
    });

    it("creates a simple quote by default", async () => {
      const mockQuote = {
        id: 2,
        userId: 1,
        orgId: 1,
        title: "Simple Quote",
        reference: "Q-456",
        status: "draft",
        quoteMode: "simple",
      };

      vi.mocked(db.createQuote).mockResolvedValue(mockQuote as any);

      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);
      const result = await caller.quotes.create({ title: "Simple Quote" });

      expect(result.quoteMode).toBe("simple");
      expect(db.createQuote).toHaveBeenCalledWith(
        expect.objectContaining({
          quoteMode: "simple",
        })
      );
    });
  });

  describe("quotes.updateComprehensiveConfig", () => {
    it("updates the comprehensive config for a quote", async () => {
      const existingQuote = {
        id: 1,
        userId: 1,
        orgId: 1,
        quoteMode: "comprehensive",
        comprehensiveConfig: { sections: {} },
      };

      vi.mocked(db.getQuoteByIdAndOrg).mockResolvedValue(existingQuote as any);
      vi.mocked(db.updateQuote).mockResolvedValue({ ...existingQuote, comprehensiveConfig: { sections: {}, timeline: { enabled: true } } } as any);

      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const newConfig = { sections: {}, timeline: { enabled: true } };
      const result = await caller.quotes.updateComprehensiveConfig({
        quoteId: 1,
        config: newConfig,
      });

      expect(db.updateQuote).toHaveBeenCalledWith(1, 1, expect.objectContaining({
        comprehensiveConfig: newConfig,
      }));
    });

    it("throws error when quote not found", async () => {
      vi.mocked(db.getQuoteByIdAndOrg).mockResolvedValue(null);
      vi.mocked(db.getQuoteById).mockResolvedValue(null);

      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      await expect(
        caller.quotes.updateComprehensiveConfig({
          quoteId: 999,
          config: {},
        })
      ).rejects.toThrow("Quote not found");
    });
  });

  describe("quotes.suggestTimeline", () => {
    it("throws error for non-comprehensive quotes", async () => {
      const simpleQuote = {
        id: 1,
        userId: 1,
        orgId: 1,
        quoteMode: "simple",
      };

      vi.mocked(db.getQuoteByIdAndOrg).mockResolvedValue(simpleQuote as any);

      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      await expect(
        caller.quotes.suggestTimeline({ quoteId: 1 })
      ).rejects.toThrow("Quote is not in comprehensive mode");
    });
  });

  describe("quotes.categorizeDocument", () => {
    it("throws error for non-comprehensive quotes", async () => {
      const simpleQuote = {
        id: 1,
        userId: 1,
        orgId: 1,
        quoteMode: "simple",
      };

      vi.mocked(db.getQuoteByIdAndOrg).mockResolvedValue(simpleQuote as any);

      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      await expect(
        caller.quotes.categorizeDocument({ quoteId: 1, inputId: 1 })
      ).rejects.toThrow("Quote is not in comprehensive mode");
    });
  });

  describe("quotes.populateReviewForms", () => {
    it("throws error for non-comprehensive quotes", async () => {
      const simpleQuote = {
        id: 1,
        userId: 1,
        orgId: 1,
        quoteMode: "simple",
      };

      vi.mocked(db.getQuoteByIdAndOrg).mockResolvedValue(simpleQuote as any);

      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      await expect(
        caller.quotes.populateReviewForms({ quoteId: 1 })
      ).rejects.toThrow("Quote is not in comprehensive mode");
    });
  });
});
