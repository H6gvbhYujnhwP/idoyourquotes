import { describe, it, expect, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// Mock the database functions
vi.mock("./db", () => ({
  getQuoteById: vi.fn(),
  getQuoteByIdAndOrg: vi.fn(),
  updateQuoteStatus: vi.fn(),
  // Include other mocked functions to prevent import errors
  getQuotesByUserId: vi.fn(),
  getQuotesByOrgId: vi.fn(),
  createQuote: vi.fn(),
  updateQuote: vi.fn(),
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
  getUserById: vi.fn(),
  getUserPrimaryOrg: vi.fn(),
  getOrganizationById: vi.fn(),
  logUsage: vi.fn(),
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

describe("Quote Status Workflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Set up org mock for org-first access pattern
    vi.mocked(db.getUserPrimaryOrg).mockResolvedValue({ id: 1, name: "Test Org", slug: "test-org" } as any);
    vi.mocked(db.getQuoteByIdAndOrg).mockResolvedValue(null); // Default to fallback to user-based access
  });

  describe("quotes.updateStatus", () => {
    it("should allow transition from draft to sent", async () => {
      const draftQuote = {
        id: 1,
        userId: 1,
        status: "draft",
        title: "Test Quote",
      };
      const sentQuote = { ...draftQuote, status: "sent", sentAt: new Date() };

      vi.mocked(db.getQuoteById).mockResolvedValue(draftQuote as any);
      vi.mocked(db.updateQuoteStatus).mockResolvedValue(sentQuote as any);

      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.quotes.updateStatus({ id: 1, status: "sent" });

      expect(db.updateQuoteStatus).toHaveBeenCalledWith(1, 1, "sent");
      expect(result.status).toBe("sent");
    });

    it("should allow transition from sent to accepted", async () => {
      const sentQuote = {
        id: 1,
        userId: 1,
        status: "sent",
        title: "Test Quote",
      };
      const acceptedQuote = { ...sentQuote, status: "accepted", acceptedAt: new Date() };

      vi.mocked(db.getQuoteById).mockResolvedValue(sentQuote as any);
      vi.mocked(db.updateQuoteStatus).mockResolvedValue(acceptedQuote as any);

      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.quotes.updateStatus({ id: 1, status: "accepted" });

      expect(db.updateQuoteStatus).toHaveBeenCalledWith(1, 1, "accepted");
      expect(result.status).toBe("accepted");
    });

    it("should allow transition from sent to declined", async () => {
      const sentQuote = {
        id: 1,
        userId: 1,
        status: "sent",
        title: "Test Quote",
      };
      const declinedQuote = { ...sentQuote, status: "declined" };

      vi.mocked(db.getQuoteById).mockResolvedValue(sentQuote as any);
      vi.mocked(db.updateQuoteStatus).mockResolvedValue(declinedQuote as any);

      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.quotes.updateStatus({ id: 1, status: "declined" });

      expect(db.updateQuoteStatus).toHaveBeenCalledWith(1, 1, "declined");
      expect(result.status).toBe("declined");
    });

    it("should allow reverting from accepted to draft", async () => {
      const acceptedQuote = {
        id: 1,
        userId: 1,
        status: "accepted",
        title: "Test Quote",
      };
      const draftQuote = { ...acceptedQuote, status: "draft" };

      vi.mocked(db.getQuoteById).mockResolvedValue(acceptedQuote as any);
      vi.mocked(db.updateQuoteStatus).mockResolvedValue(draftQuote as any);

      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.quotes.updateStatus({ id: 1, status: "draft" });

      expect(db.updateQuoteStatus).toHaveBeenCalledWith(1, 1, "draft");
      expect(result.status).toBe("draft");
    });

    it("should reject invalid transition from draft to accepted", async () => {
      const draftQuote = {
        id: 1,
        userId: 1,
        status: "draft",
        title: "Test Quote",
      };

      vi.mocked(db.getQuoteById).mockResolvedValue(draftQuote as any);

      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      await expect(
        caller.quotes.updateStatus({ id: 1, status: "accepted" })
      ).rejects.toThrow("Cannot change status from draft to accepted");
    });

    it("should reject invalid transition from draft to declined", async () => {
      const draftQuote = {
        id: 1,
        userId: 1,
        status: "draft",
        title: "Test Quote",
      };

      vi.mocked(db.getQuoteById).mockResolvedValue(draftQuote as any);

      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      await expect(
        caller.quotes.updateStatus({ id: 1, status: "declined" })
      ).rejects.toThrow("Cannot change status from draft to declined");
    });

    it("should throw error for quote not found", async () => {
      vi.mocked(db.getQuoteById).mockResolvedValue(null);

      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      await expect(
        caller.quotes.updateStatus({ id: 999, status: "sent" })
      ).rejects.toThrow("Quote not found");
    });

    it("should allow sent quote to revert to draft", async () => {
      const sentQuote = {
        id: 1,
        userId: 1,
        status: "sent",
        title: "Test Quote",
      };
      const draftQuote = { ...sentQuote, status: "draft" };

      vi.mocked(db.getQuoteById).mockResolvedValue(sentQuote as any);
      vi.mocked(db.updateQuoteStatus).mockResolvedValue(draftQuote as any);

      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.quotes.updateStatus({ id: 1, status: "draft" });

      expect(result.status).toBe("draft");
    });
  });
});
