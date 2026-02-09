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

describe("quotes router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Set up org mock for org-first access pattern
    vi.mocked(db.getUserPrimaryOrg).mockResolvedValue({ id: 1, name: "Test Org", slug: "test-org" } as any);
    vi.mocked(db.getQuoteByIdAndOrg).mockResolvedValue(null); // Default to fallback to user-based access
  });

  describe("quotes.list", () => {
    it("returns quotes for the authenticated user via org", async () => {
      const mockOrg = { id: 10, name: "Test Org", slug: "test-org" };
      const mockQuotes = [
        { id: 1, userId: 1, orgId: 10, title: "Test Quote 1", status: "draft", total: "100.00" },
        { id: 2, userId: 1, orgId: 10, title: "Test Quote 2", status: "sent", total: "250.00" },
      ];
      vi.mocked(db.getUserPrimaryOrg).mockResolvedValue(mockOrg as any);
      vi.mocked(db.getQuotesByOrgId).mockResolvedValue(mockQuotes as any);

      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.quotes.list();

      expect(db.getUserPrimaryOrg).toHaveBeenCalledWith(1);
      expect(db.getQuotesByOrgId).toHaveBeenCalledWith(10);
      expect(result).toEqual(mockQuotes);
    });

    it("falls back to user-based access when no org", async () => {
      const mockQuotes = [
        { id: 1, userId: 1, title: "Test Quote 1", status: "draft", total: "100.00" },
      ];
      vi.mocked(db.getUserPrimaryOrg).mockResolvedValue(undefined);
      vi.mocked(db.getQuotesByUserId).mockResolvedValue(mockQuotes as any);

      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.quotes.list();

      expect(db.getUserPrimaryOrg).toHaveBeenCalledWith(1);
      expect(db.getQuotesByUserId).toHaveBeenCalledWith(1);
      expect(result).toEqual(mockQuotes);
    });
  });

  describe("quotes.create", () => {
    it("creates a new quote with org id", async () => {
      const mockOrg = { id: 10, name: "Test Org", slug: "test-org" };
      const mockQuote = {
        id: 1,
        userId: 1,
        orgId: 10,
        title: "New Quote",
        clientName: "Test Client",
        status: "draft",
        total: "0.00",
      };
      vi.mocked(db.getUserPrimaryOrg).mockResolvedValue(mockOrg as any);
      vi.mocked(db.createQuote).mockResolvedValue(mockQuote as any);

      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.quotes.create({
        title: "New Quote",
        clientName: "Test Client",
      });

      expect(db.getUserPrimaryOrg).toHaveBeenCalledWith(1);
      expect(db.createQuote).toHaveBeenCalledWith({
        userId: 1,
        orgId: 10,
        title: "New Quote",
        clientName: "Test Client",
        terms: undefined,
        quoteMode: "simple",
        tradePreset: undefined,
        comprehensiveConfig: undefined,
      });
      expect(result).toEqual(mockQuote);
    });

    it("creates a quote without org when user has no org", async () => {
      const mockQuote = {
        id: 1,
        userId: 1,
        status: "draft",
        total: "0.00",
      };
      vi.mocked(db.getUserPrimaryOrg).mockResolvedValue(undefined);
      vi.mocked(db.createQuote).mockResolvedValue(mockQuote as any);

      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.quotes.create({});

      expect(db.createQuote).toHaveBeenCalledWith({
        userId: 1,
        orgId: undefined,
        terms: undefined,
        quoteMode: "simple",
        tradePreset: undefined,
        comprehensiveConfig: undefined,
      });
      expect(result).toEqual(mockQuote);
    });
  });

  describe("quotes.get", () => {
    it("returns a quote by id via org", async () => {
      const mockOrg = { id: 10, name: "Test Org", slug: "test-org" };
      const mockQuote = { id: 1, userId: 1, orgId: 10, title: "Test Quote", status: "draft" };
      vi.mocked(db.getUserPrimaryOrg).mockResolvedValue(mockOrg as any);
      vi.mocked(db.getQuoteByIdAndOrg).mockResolvedValue(mockQuote as any);

      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.quotes.get({ id: 1 });

      expect(db.getUserPrimaryOrg).toHaveBeenCalledWith(1);
      expect(db.getQuoteByIdAndOrg).toHaveBeenCalledWith(1, 10);
      expect(result).toEqual(mockQuote);
    });

    it("falls back to user-based access when org lookup fails", async () => {
      const mockQuote = { id: 1, userId: 1, title: "Test Quote", status: "draft" };
      vi.mocked(db.getUserPrimaryOrg).mockResolvedValue(undefined);
      vi.mocked(db.getQuoteById).mockResolvedValue(mockQuote as any);

      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.quotes.get({ id: 1 });

      expect(db.getQuoteById).toHaveBeenCalledWith(1, 1);
      expect(result).toEqual(mockQuote);
    });

    it("throws error when quote not found", async () => {
      vi.mocked(db.getUserPrimaryOrg).mockResolvedValue(undefined);
      vi.mocked(db.getQuoteById).mockResolvedValue(undefined);

      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      await expect(caller.quotes.get({ id: 999 })).rejects.toThrow("Quote not found");
    });
  });

  describe("quotes.update", () => {
    it("updates a quote with provided data", async () => {
      const existingQuote = { id: 1, userId: 1, title: "Original Quote", status: "draft" };
      const mockQuote = { id: 1, userId: 1, title: "Updated Quote", status: "draft" };
      vi.mocked(db.getQuoteById).mockResolvedValue(existingQuote as any);
      vi.mocked(db.updateQuote).mockResolvedValue(mockQuote as any);

      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.quotes.update({
        id: 1,
        title: "Updated Quote",
      });

      expect(db.updateQuote).toHaveBeenCalledWith(1, 1, { title: "Updated Quote" });
      expect(result).toEqual(mockQuote);
    });

    it("recalculates totals when tax rate changes", async () => {
      const existingQuote = { id: 1, userId: 1, taxRate: "0", total: "100.00" };
      const mockQuote = { id: 1, userId: 1, taxRate: "20", total: "120.00" };
      vi.mocked(db.getQuoteById).mockResolvedValue(existingQuote as any);
      vi.mocked(db.updateQuote).mockResolvedValue(mockQuote as any);
      vi.mocked(db.recalculateQuoteTotals).mockResolvedValue(mockQuote as any);

      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.quotes.update({
        id: 1,
        taxRate: "20",
      });

      expect(db.updateQuote).toHaveBeenCalled();
      expect(db.recalculateQuoteTotals).toHaveBeenCalledWith(1, 1);
    });
  });

  describe("quotes.delete", () => {
    it("deletes a quote", async () => {
      const existingQuote = { id: 1, userId: 1, title: "Test Quote", status: "draft" };
      vi.mocked(db.getQuoteById).mockResolvedValue(existingQuote as any);
      vi.mocked(db.deleteQuote).mockResolvedValue({ success: true, deletedFiles: [] });

      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.quotes.delete({ id: 1 });

      expect(db.deleteQuote).toHaveBeenCalledWith(1, 1);
      expect(result).toEqual({ success: true, deletedFilesCount: 0 });
    });

    it("deletes a quote with attached files", async () => {
      const existingQuote = { id: 1, userId: 1, title: "Test Quote", status: "draft" };
      vi.mocked(db.getQuoteById).mockResolvedValue(existingQuote as any);
      vi.mocked(db.deleteQuote).mockResolvedValue({ 
        success: true, 
        deletedFiles: ["file1.pdf", "file2.docx"] 
      });

      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.quotes.delete({ id: 1 });

      expect(db.deleteQuote).toHaveBeenCalledWith(1, 1);
      expect(result).toEqual({ success: true, deletedFilesCount: 2 });
    });
  });

  describe("quotes.duplicate", () => {
    it("duplicates a quote with new reference and draft status", async () => {
      const existingQuote = { 
        id: 1, 
        userId: 1, 
        orgId: 10,
        title: "Original Quote", 
        status: "sent",
        clientName: "Test Client",
        total: "500.00"
      };
      const duplicatedQuote = {
        id: 2,
        userId: 1,
        orgId: 10,
        reference: "Q-1234567890",
        title: "Original Quote (Copy)",
        status: "draft",
        clientName: "Test Client",
        total: "500.00"
      };
      const mockOrg = { id: 10, name: "Test Org", slug: "test-org" };
      
      vi.mocked(db.getUserPrimaryOrg).mockResolvedValue(mockOrg as any);
      vi.mocked(db.getQuoteByIdAndOrg).mockResolvedValue(existingQuote as any);
      vi.mocked(db.duplicateQuote).mockResolvedValue(duplicatedQuote as any);

      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.quotes.duplicate({ id: 1 });

      expect(db.getUserPrimaryOrg).toHaveBeenCalledWith(1);
      expect(db.getQuoteByIdAndOrg).toHaveBeenCalledWith(1, 10);
      expect(db.duplicateQuote).toHaveBeenCalledWith(1, 1, 10);
      expect(result).toEqual(duplicatedQuote);
      expect(result.status).toBe("draft");
      expect(result.id).not.toBe(existingQuote.id);
    });

    it("duplicates a quote using user-based access when no org", async () => {
      const existingQuote = { 
        id: 1, 
        userId: 1, 
        title: "Original Quote", 
        status: "accepted"
      };
      const duplicatedQuote = {
        id: 2,
        userId: 1,
        reference: "Q-1234567890",
        title: "Original Quote (Copy)",
        status: "draft"
      };
      
      vi.mocked(db.getUserPrimaryOrg).mockResolvedValue(undefined);
      vi.mocked(db.getQuoteByIdAndOrg).mockResolvedValue(null);
      vi.mocked(db.getQuoteById).mockResolvedValue(existingQuote as any);
      vi.mocked(db.duplicateQuote).mockResolvedValue(duplicatedQuote as any);

      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.quotes.duplicate({ id: 1 });

      expect(db.getQuoteById).toHaveBeenCalledWith(1, 1);
      expect(db.duplicateQuote).toHaveBeenCalledWith(1, 1, undefined);
      expect(result.status).toBe("draft");
    });

    it("throws error when quote not found", async () => {
      vi.mocked(db.getUserPrimaryOrg).mockResolvedValue(undefined);
      vi.mocked(db.getQuoteByIdAndOrg).mockResolvedValue(null);
      vi.mocked(db.getQuoteById).mockResolvedValue(undefined);

      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      await expect(caller.quotes.duplicate({ id: 999 })).rejects.toThrow("Quote not found");
    });
  });
});

describe("lineItems router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Set up org mock for org-first access pattern
    vi.mocked(db.getUserPrimaryOrg).mockResolvedValue({ id: 1, name: "Test Org", slug: "test-org" } as any);
    vi.mocked(db.getQuoteByIdAndOrg).mockResolvedValue(null); // Default to fallback to user-based access
  });

  describe("lineItems.create", () => {
    it("creates a line item and recalculates quote totals", async () => {
      const mockQuote = { id: 1, userId: 1 };
      const mockLineItem = {
        id: 1,
        quoteId: 1,
        description: "Test Item",
        quantity: "2",
        unit: "hours",
        rate: "50.00",
        total: "100.00",
      };

      vi.mocked(db.getQuoteById).mockResolvedValue(mockQuote as any);
      vi.mocked(db.createLineItem).mockResolvedValue(mockLineItem as any);
      vi.mocked(db.recalculateQuoteTotals).mockResolvedValue(mockQuote as any);

      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.lineItems.create({
        quoteId: 1,
        description: "Test Item",
        quantity: "2",
        unit: "hours",
        rate: "50.00",
      });

      expect(db.getQuoteById).toHaveBeenCalledWith(1, 1);
      expect(db.createLineItem).toHaveBeenCalledWith({
        quoteId: 1,
        description: "Test Item",
        quantity: "2",
        unit: "hours",
        rate: "50.00",
        total: "100.00",
      });
      expect(db.recalculateQuoteTotals).toHaveBeenCalledWith(1, 1);
      expect(result).toEqual(mockLineItem);
    });

    it("throws error when quote not found", async () => {
      vi.mocked(db.getQuoteById).mockResolvedValue(undefined);

      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      await expect(
        caller.lineItems.create({
          quoteId: 999,
          description: "Test Item",
        })
      ).rejects.toThrow("Quote not found");
    });
  });

  describe("lineItems.delete", () => {
    it("deletes a line item and recalculates quote totals", async () => {
      const mockQuote = { id: 1, userId: 1 };
      vi.mocked(db.getQuoteById).mockResolvedValue(mockQuote as any);
      vi.mocked(db.deleteLineItem).mockResolvedValue(true);
      vi.mocked(db.recalculateQuoteTotals).mockResolvedValue(mockQuote as any);

      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.lineItems.delete({ id: 1, quoteId: 1 });

      expect(db.deleteLineItem).toHaveBeenCalledWith(1);
      expect(db.recalculateQuoteTotals).toHaveBeenCalledWith(1, 1);
      expect(result).toEqual({ success: true });
    });
  });
});

describe("catalog router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("catalog.list", () => {
    it("returns catalog items via org", async () => {
      const mockOrg = { id: 10, name: "Test Org", slug: "test-org" };
      const mockItems = [
        { id: 1, userId: 1, orgId: 10, name: "Electrical Work", defaultRate: "75.00" },
        { id: 2, userId: 1, orgId: 10, name: "Plumbing", defaultRate: "65.00" },
      ];
      vi.mocked(db.getUserPrimaryOrg).mockResolvedValue(mockOrg as any);
      vi.mocked(db.getCatalogItemsByOrgId).mockResolvedValue(mockItems as any);

      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.catalog.list();

      expect(db.getUserPrimaryOrg).toHaveBeenCalledWith(1);
      expect(db.getCatalogItemsByOrgId).toHaveBeenCalledWith(10);
      expect(result).toEqual(mockItems);
    });

    it("falls back to user-based access when no org", async () => {
      const mockItems = [
        { id: 1, userId: 1, name: "Electrical Work", defaultRate: "75.00" },
      ];
      vi.mocked(db.getUserPrimaryOrg).mockResolvedValue(undefined);
      vi.mocked(db.getCatalogItemsByUserId).mockResolvedValue(mockItems as any);

      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.catalog.list();

      expect(db.getCatalogItemsByUserId).toHaveBeenCalledWith(1);
      expect(result).toEqual(mockItems);
    });
  });

  describe("catalog.create", () => {
    it("creates a catalog item with org id", async () => {
      const mockOrg = { id: 10, name: "Test Org", slug: "test-org" };
      const mockItem = {
        id: 1,
        userId: 1,
        orgId: 10,
        name: "New Service",
        description: "Test description",
        unit: "hour",
        defaultRate: "100.00",
      };
      vi.mocked(db.getUserPrimaryOrg).mockResolvedValue(mockOrg as any);
      vi.mocked(db.createCatalogItem).mockResolvedValue(mockItem as any);

      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.catalog.create({
        name: "New Service",
        description: "Test description",
        unit: "hour",
        defaultRate: "100.00",
      });

      expect(db.getUserPrimaryOrg).toHaveBeenCalledWith(1);
      expect(db.createCatalogItem).toHaveBeenCalledWith({
        userId: 1,
        orgId: 10,
        name: "New Service",
        description: "Test description",
        unit: "hour",
        defaultRate: "100.00",
      });
      expect(result).toEqual(mockItem);
    });
  });

  describe("catalog.delete", () => {
    it("deletes a catalog item", async () => {
      vi.mocked(db.deleteCatalogItem).mockResolvedValue(true);

      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.catalog.delete({ id: 1 });

      expect(db.deleteCatalogItem).toHaveBeenCalledWith(1, 1);
      expect(result).toEqual({ success: true });
    });
  });
});
