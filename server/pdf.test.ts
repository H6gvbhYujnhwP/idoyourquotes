import { describe, it, expect, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// Mock the database functions
vi.mock("./db", () => ({
  getQuoteById: vi.fn(),
  getQuoteByIdAndOrg: vi.fn(),
  getLineItemsByQuoteId: vi.fn(),
  getUserById: vi.fn(),
  updateUser: vi.fn(),
  updateUserProfile: vi.fn(),
  changePassword: vi.fn(),
  // Include other mocked functions to prevent import errors
  getQuotesByUserId: vi.fn(),
  getQuotesByOrgId: vi.fn(),
  createQuote: vi.fn(),
  updateQuote: vi.fn(),
  deleteQuote: vi.fn(),
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

// Mock user for testing
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
  companyName: "Test Company Ltd",
  companyAddress: "123 Test Street, Test City",
  companyPhone: "+1 555-0123",
  companyEmail: "billing@testcompany.com",
  companyLogo: "https://example.com/logo.png",
  defaultTerms: "Payment due within 30 days",
};

const mockUserNoLogo: AuthenticatedUser = {
  ...mockUser,
  companyLogo: null,
};

// Mock quote data
const mockQuote = {
  id: 1,
  userId: 1,
  title: "Website Development Project",
  clientName: "John Doe",
  clientEmail: "john@example.com",
  clientPhone: "+1 555-9876",
  clientAddress: "456 Client Ave, Client City",
  description: "Full website redesign",
  status: "draft" as const,
  terms: "50% upfront, 50% on completion",
  taxRate: "10.00",
  subtotal: "1500.00",
  taxAmount: "150.00",
  total: "1650.00",
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockLineItems = [
  {
    id: 1,
    quoteId: 1,
    description: "Homepage Design",
    quantity: "1",
    unit: "page",
    rate: "500.00",
    amount: "500.00",
    sortOrder: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 2,
    quoteId: 1,
    description: "Development Hours",
    quantity: "20",
    unit: "hours",
    rate: "50.00",
    amount: "1000.00",
    sortOrder: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

function createAuthContext(user: AuthenticatedUser = mockUser): TrpcContext {
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

describe("PDF Generation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Set up org mock for org-first access pattern
    vi.mocked(db.getUserPrimaryOrg).mockResolvedValue({ 
      id: 1, 
      name: "Test Org", 
      slug: "test-org",
      companyLogo: null,
      brandPrimaryColor: null,
      brandSecondaryColor: null,
    } as any);
    vi.mocked(db.getQuoteByIdAndOrg).mockResolvedValue(null); // Default to fallback to user-based access
  });

  describe("quotes.generatePDF", () => {
    it("should generate PDF HTML with company logo", async () => {
      vi.mocked(db.getQuoteById).mockResolvedValue(mockQuote as any);
      vi.mocked(db.getLineItemsByQuoteId).mockResolvedValue(mockLineItems as any);
      vi.mocked(db.getUserById).mockResolvedValue(mockUser as any);
      // Set org with logo for this test
      vi.mocked(db.getUserPrimaryOrg).mockResolvedValue({ 
        id: 1, 
        name: "Test Org", 
        slug: "test-org",
        companyLogo: "https://example.com/logo.png",
        brandPrimaryColor: "#ff5500",
        brandSecondaryColor: "#cc4400",
      } as any);

      const ctx = createAuthContext(mockUser);
      const caller = appRouter.createCaller(ctx);

      const result = await caller.quotes.generatePDF({ id: 1 });

      expect(result).toHaveProperty("html");
      // Organization name takes precedence over user's company name
      expect(result.html).toContain("Test Org");
      expect(result.html).toContain("John Doe");
      // Title is used in the HTML title tag, description is in the body
      expect(result.html).toContain("Full website redesign"); // Description
      expect(result.html).toContain("Homepage Design");
      expect(result.html).toContain("Development Hours");
      expect(result.html).toContain("£1,500.00"); // Subtotal
      expect(result.html).toContain("£150.00"); // Tax
      expect(result.html).toContain("£1,650.00"); // Total
      expect(result.html).toContain("https://example.com/logo.png"); // Logo URL from org
      // Check brand colors are used
      expect(result.html).toContain("#ff5500"); // Primary brand color
    });

    it("should generate PDF HTML without logo when user has no logo", async () => {
      vi.mocked(db.getQuoteById).mockResolvedValue(mockQuote as any);
      vi.mocked(db.getLineItemsByQuoteId).mockResolvedValue(mockLineItems as any);
      vi.mocked(db.getUserById).mockResolvedValue(mockUserNoLogo as any);

      const ctx = createAuthContext(mockUserNoLogo);
      const caller = appRouter.createCaller(ctx);

      const result = await caller.quotes.generatePDF({ id: 1 });

      expect(result).toHaveProperty("html");
      // Organization name takes precedence over user's company name
      expect(result.html).toContain("Test Org");
      // Check that there's no img tag in the logo section
      expect(result.html).not.toContain('src="https://example.com/logo.png"');
    });

    it("should throw error for quote not found", async () => {
      vi.mocked(db.getQuoteById).mockResolvedValue(null);

      const ctx = createAuthContext(mockUser);
      const caller = appRouter.createCaller(ctx);

      await expect(caller.quotes.generatePDF({ id: 999 })).rejects.toThrow(
        "Quote not found"
      );
    });

    it("should throw error when user doesn't own the quote", async () => {
      // getQuoteById returns undefined when user doesn't own the quote (due to userId filter)
      vi.mocked(db.getQuoteById).mockResolvedValue(undefined);

      const ctx = createAuthContext(mockUser);
      const caller = appRouter.createCaller(ctx);

      await expect(caller.quotes.generatePDF({ id: 1 })).rejects.toThrow(
        "Quote not found"
      );
    });

    it("should include terms and conditions in PDF", async () => {
      vi.mocked(db.getQuoteById).mockResolvedValue(mockQuote as any);
      vi.mocked(db.getLineItemsByQuoteId).mockResolvedValue(mockLineItems as any);
      vi.mocked(db.getUserById).mockResolvedValue(mockUser as any);

      const ctx = createAuthContext(mockUser);
      const caller = appRouter.createCaller(ctx);

      const result = await caller.quotes.generatePDF({ id: 1 });

      expect(result.html).toContain("50% upfront, 50% on completion");
    });

    it("should include quote date in PDF", async () => {
      vi.mocked(db.getQuoteById).mockResolvedValue(mockQuote as any);
      vi.mocked(db.getLineItemsByQuoteId).mockResolvedValue(mockLineItems as any);
      vi.mocked(db.getUserById).mockResolvedValue(mockUser as any);

      const ctx = createAuthContext(mockUser);
      const caller = appRouter.createCaller(ctx);

      const result = await caller.quotes.generatePDF({ id: 1 });

      // Should contain date formatting
      expect(result.html).toContain("Date:");
    });
  });
});

describe("Logo Upload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("auth.updateProfile (logo update)", () => {
    it("should update user profile with logo URL", async () => {
      // Mock updateUserProfile function
      const { updateUserProfile } = await import("./db");
      vi.mocked(updateUserProfile).mockResolvedValue({
        ...mockUser,
        companyLogo: "https://new-logo-url.com/logo.png",
      } as any);

      const ctx = createAuthContext(mockUser);
      const caller = appRouter.createCaller(ctx);

      const result = await caller.auth.updateProfile({
        companyLogo: "https://new-logo-url.com/logo.png",
      });

      expect(updateUserProfile).toHaveBeenCalledWith(1, {
        companyLogo: "https://new-logo-url.com/logo.png",
      });
    });

    it("should allow removing logo by setting empty string", async () => {
      const { updateUserProfile } = await import("./db");
      vi.mocked(updateUserProfile).mockResolvedValue({
        ...mockUser,
        companyLogo: "",
      } as any);

      const ctx = createAuthContext(mockUser);
      const caller = appRouter.createCaller(ctx);

      const result = await caller.auth.updateProfile({
        companyLogo: "",
      });

      expect(updateUserProfile).toHaveBeenCalledWith(1, {
        companyLogo: "",
      });
    });
  });
});
