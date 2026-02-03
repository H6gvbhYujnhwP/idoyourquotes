import { describe, it, expect, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// Mock the database functions
vi.mock("./db", () => ({
  getCatalogItemsByUserId: vi.fn(),
  createCatalogItem: vi.fn(),
  updateCatalogItem: vi.fn(),
  deleteCatalogItem: vi.fn(),
  getQuoteById: vi.fn(),
  createLineItem: vi.fn(),
  recalculateQuoteTotals: vi.fn(),
  // Include other mocked functions to prevent import errors
  getQuotesByUserId: vi.fn(),
  createQuote: vi.fn(),
  updateQuote: vi.fn(),
  updateQuoteStatus: vi.fn(),
  deleteQuote: vi.fn(),
  getLineItemsByQuoteId: vi.fn(),
  updateLineItem: vi.fn(),
  deleteLineItem: vi.fn(),
  getInputsByQuoteId: vi.fn(),
  createInput: vi.fn(),
  deleteInput: vi.fn(),
  getTenderContextByQuoteId: vi.fn(),
  upsertTenderContext: vi.fn(),
  getInternalEstimateByQuoteId: vi.fn(),
  upsertInternalEstimate: vi.fn(),
  updateUserProfile: vi.fn(),
  changePassword: vi.fn(),
  getUserById: vi.fn(),
}));

import * as db from "./db";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

const mockUser: AuthenticatedUser = {
  id: 1,
  openId: "test-user-123",
  email: "test@example.com",
  name: "Test User",
  loginMethod: "email",
  role: "user",
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSignedIn: new Date(),
};

function createAuthContext(): TrpcContext {
  return {
    user: mockUser,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

describe("Catalog Quick-Add", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("catalog.list", () => {
    it("should return user's catalog items", async () => {
      const mockCatalogItems = [
        {
          id: 1,
          userId: 1,
          name: "Web Development",
          description: "Full-stack web development services",
          category: "Development",
          unit: "hour",
          defaultRate: "75.00",
          costPrice: "50.00",
          isActive: 1,
        },
        {
          id: 2,
          userId: 1,
          name: "Server Setup",
          description: "Linux server configuration",
          category: "Infrastructure",
          unit: "each",
          defaultRate: "250.00",
          costPrice: "100.00",
          isActive: 1,
        },
      ];

      vi.mocked(db.getCatalogItemsByUserId).mockResolvedValue(mockCatalogItems as any);

      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.catalog.list();

      expect(db.getCatalogItemsByUserId).toHaveBeenCalledWith(1);
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe("Web Development");
      expect(result[1].name).toBe("Server Setup");
    });

    it("should return empty array when user has no catalog items", async () => {
      vi.mocked(db.getCatalogItemsByUserId).mockResolvedValue([]);

      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.catalog.list();

      expect(result).toHaveLength(0);
    });
  });

  describe("catalog.create", () => {
    it("should create a new catalog item", async () => {
      const newItem = {
        id: 1,
        userId: 1,
        name: "Consulting",
        description: "IT consulting services",
        category: "Services",
        unit: "hour",
        defaultRate: "100.00",
        costPrice: "0.00",
        isActive: 1,
      };

      vi.mocked(db.createCatalogItem).mockResolvedValue(newItem as any);

      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.catalog.create({
        name: "Consulting",
        description: "IT consulting services",
        category: "Services",
        unit: "hour",
        defaultRate: "100.00",
      });

      expect(db.createCatalogItem).toHaveBeenCalledWith({
        userId: 1,
        name: "Consulting",
        description: "IT consulting services",
        category: "Services",
        unit: "hour",
        defaultRate: "100.00",
      });
      expect(result.name).toBe("Consulting");
    });
  });

  describe("lineItems.create with catalog data", () => {
    it("should create line item from catalog item data", async () => {
      const mockQuote = { id: 1, userId: 1, status: "draft" };
      const mockLineItem = {
        id: 1,
        quoteId: 1,
        description: "Web Development - Full-stack web development services",
        quantity: "1",
        unit: "hour",
        rate: "75.00",
        total: "75.00",
      };

      vi.mocked(db.getQuoteById).mockResolvedValue(mockQuote as any);
      vi.mocked(db.createLineItem).mockResolvedValue(mockLineItem as any);
      vi.mocked(db.recalculateQuoteTotals).mockResolvedValue(mockQuote as any);

      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.lineItems.create({
        quoteId: 1,
        description: "Web Development - Full-stack web development services",
        quantity: "1",
        unit: "hour",
        rate: "75.00",
      });

      expect(db.createLineItem).toHaveBeenCalledWith({
        quoteId: 1,
        description: "Web Development - Full-stack web development services",
        quantity: "1",
        unit: "hour",
        rate: "75.00",
        total: "75.00",
      });
      expect(result.description).toBe("Web Development - Full-stack web development services");
    });

    it("should calculate total correctly when adding from catalog", async () => {
      const mockQuote = { id: 1, userId: 1, status: "draft" };
      const mockLineItem = {
        id: 1,
        quoteId: 1,
        description: "Server Setup",
        quantity: "3",
        unit: "each",
        rate: "250.00",
        total: "750.00",
      };

      vi.mocked(db.getQuoteById).mockResolvedValue(mockQuote as any);
      vi.mocked(db.createLineItem).mockResolvedValue(mockLineItem as any);
      vi.mocked(db.recalculateQuoteTotals).mockResolvedValue(mockQuote as any);

      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.lineItems.create({
        quoteId: 1,
        description: "Server Setup",
        quantity: "3",
        unit: "each",
        rate: "250.00",
      });

      expect(db.createLineItem).toHaveBeenCalledWith(
        expect.objectContaining({
          total: "750.00",
        })
      );
    });
  });

  describe("catalog.delete", () => {
    it("should delete a catalog item", async () => {
      vi.mocked(db.deleteCatalogItem).mockResolvedValue(undefined);

      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.catalog.delete({ id: 1 });

      expect(db.deleteCatalogItem).toHaveBeenCalledWith(1, 1);
      expect(result.success).toBe(true);
    });
  });

  describe("catalog.update", () => {
    it("should update a catalog item", async () => {
      const updatedItem = {
        id: 1,
        userId: 1,
        name: "Updated Service",
        description: "Updated description",
        category: "Updated Category",
        unit: "day",
        defaultRate: "500.00",
        costPrice: "200.00",
        isActive: 1,
      };

      vi.mocked(db.updateCatalogItem).mockResolvedValue(updatedItem as any);

      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.catalog.update({
        id: 1,
        name: "Updated Service",
        defaultRate: "500.00",
      });

      expect(db.updateCatalogItem).toHaveBeenCalledWith(1, 1, {
        name: "Updated Service",
        defaultRate: "500.00",
      });
      expect(result.name).toBe("Updated Service");
    });
  });
});
