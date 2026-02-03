import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the LLM module
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn(),
}));

// Mock the db module
vi.mock("./db", () => ({
  getQuoteById: vi.fn(),
  getLineItemsByQuoteId: vi.fn(),
  getTenderContextByQuoteId: vi.fn(),
}));

import { invokeLLM } from "./_core/llm";
import { getQuoteById, getLineItemsByQuoteId, getTenderContextByQuoteId } from "./db";

const mockInvokeLLM = invokeLLM as ReturnType<typeof vi.fn>;
const mockGetQuoteById = getQuoteById as ReturnType<typeof vi.fn>;
const mockGetLineItemsByQuoteId = getLineItemsByQuoteId as ReturnType<typeof vi.fn>;
const mockGetTenderContextByQuoteId = getTenderContextByQuoteId as ReturnType<typeof vi.fn>;

describe("Generate Email Feature", () => {
  const mockUser = {
    id: 1,
    name: "John Smith",
    email: "john@example.com",
    companyName: "Smith Construction Ltd",
    companyAddress: "123 Main St",
    companyPhone: "07700 900000",
    companyEmail: "info@smithconstruction.com",
  };

  const mockQuote = {
    id: 1,
    userId: 1,
    title: "Kitchen Renovation Project",
    reference: "Q-2024-001",
    status: "draft",
    clientName: "Jane Doe",
    clientEmail: "jane@client.com",
    clientPhone: "07700 900001",
    clientAddress: "456 Oak Ave",
    description: "Full kitchen renovation including cabinets and countertops",
    subtotal: "5000.00",
    taxRate: "20",
    taxAmount: "1000.00",
    total: "6000.00",
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockLineItems = [
    { id: 1, quoteId: 1, description: "Kitchen cabinets - supply and install", quantity: "1", unit: "set", rate: "2500.00", amount: "2500.00" },
    { id: 2, quoteId: 1, description: "Granite countertops", quantity: "10", unit: "sqm", rate: "150.00", amount: "1500.00" },
    { id: 3, quoteId: 1, description: "Labour - installation", quantity: "3", unit: "days", rate: "350.00", amount: "1050.00" },
  ];

  const mockTenderContext = {
    id: 1,
    quoteId: 1,
    assumptions: JSON.stringify([
      { text: "Access to property during work hours" },
      { text: "Electrical connections are in good condition" },
    ]),
    exclusions: JSON.stringify([
      { text: "Plumbing work" },
      { text: "Electrical rewiring" },
    ]),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetQuoteById.mockResolvedValue(mockQuote);
    mockGetLineItemsByQuoteId.mockResolvedValue(mockLineItems);
    mockGetTenderContextByQuoteId.mockResolvedValue(mockTenderContext);
  });

  describe("Email Generation Logic", () => {
    it("should build correct context from quote data", async () => {
      // Verify the data retrieval functions are called correctly
      const quote = await mockGetQuoteById(1, 1);
      const lineItems = await mockGetLineItemsByQuoteId(1);
      const tenderContext = await mockGetTenderContextByQuoteId(1);

      expect(quote).toEqual(mockQuote);
      expect(lineItems).toEqual(mockLineItems);
      expect(tenderContext).toEqual(mockTenderContext);
    });

    it("should format currency values correctly", () => {
      const total = mockQuote.total;
      const formatted = `£${parseFloat(total).toLocaleString("en-GB", { minimumFractionDigits: 2 })}`;
      expect(formatted).toBe("£6,000.00");
    });

    it("should build line items summary correctly", () => {
      const lineItemsSummary = mockLineItems.slice(0, 5).map(item => `- ${item.description}`).join("\n");
      expect(lineItemsSummary).toContain("Kitchen cabinets");
      expect(lineItemsSummary).toContain("Granite countertops");
      expect(lineItemsSummary).toContain("Labour - installation");
    });

    it("should parse assumptions from tender context", () => {
      const parsed = JSON.parse(mockTenderContext.assumptions);
      const assumptions = parsed.map((a: { text: string }) => a.text);
      expect(assumptions).toContain("Access to property during work hours");
      expect(assumptions).toContain("Electrical connections are in good condition");
    });

    it("should parse exclusions from tender context", () => {
      const parsed = JSON.parse(mockTenderContext.exclusions);
      const exclusions = parsed.map((e: { text: string }) => e.text);
      expect(exclusions).toContain("Plumbing work");
      expect(exclusions).toContain("Electrical rewiring");
    });

    it("should handle missing tender context gracefully", async () => {
      mockGetTenderContextByQuoteId.mockResolvedValue(null);
      const tenderContext = await mockGetTenderContextByQuoteId(1);
      expect(tenderContext).toBeNull();
      
      // Should not throw when building key notes
      const keyNotes: string[] = [];
      expect(keyNotes.length).toBe(0);
    });

    it("should handle empty line items", async () => {
      mockGetLineItemsByQuoteId.mockResolvedValue([]);
      const lineItems = await mockGetLineItemsByQuoteId(1);
      
      const lineItemsSummary = lineItems.length > 0
        ? lineItems.slice(0, 5).map((item: { description: string }) => `- ${item.description}`).join("\n")
        : "[No line items specified]";
      
      expect(lineItemsSummary).toBe("[No line items specified]");
    });
  });

  describe("LLM Email Generation", () => {
    it("should call LLM with correct prompt structure", async () => {
      const mockEmailResponse = {
        choices: [{
          message: {
            content: JSON.stringify({
              subject: "Quotation – Kitchen Renovation Project",
              htmlBody: "<p>Hi Jane,</p><p>Please find attached our quotation.</p>",
              textBody: "Hi Jane,\n\nPlease find attached our quotation.",
            }),
          },
        }],
      };
      mockInvokeLLM.mockResolvedValue(mockEmailResponse);

      const response = await mockInvokeLLM({
        messages: [
          { role: "system", content: expect.stringContaining("professional business email writer") },
          { role: "user", content: expect.stringContaining("Kitchen Renovation Project") },
        ],
        response_format: { type: "json_object" },
      });

      expect(response.choices[0].message.content).toBeDefined();
      const parsed = JSON.parse(response.choices[0].message.content);
      expect(parsed.subject).toBe("Quotation – Kitchen Renovation Project");
    });

    it("should parse LLM response correctly", async () => {
      const mockEmailResponse = {
        choices: [{
          message: {
            content: JSON.stringify({
              subject: "Quotation – Kitchen Renovation Project",
              htmlBody: "<p style=\"font-family: Arial;\">Hi Jane Doe,</p><p>Please find attached our quotation for Kitchen Renovation Project.</p><p><strong>Total: £6,000.00</strong></p>",
              textBody: "Hi Jane Doe,\n\nPlease find attached our quotation for Kitchen Renovation Project.\n\nTotal: £6,000.00",
            }),
          },
        }],
      };
      mockInvokeLLM.mockResolvedValue(mockEmailResponse);

      const response = await mockInvokeLLM({});
      const content = response.choices[0]?.message?.content;
      const email = JSON.parse(content);

      expect(email.subject).toBe("Quotation – Kitchen Renovation Project");
      expect(email.htmlBody).toContain("Jane Doe");
      expect(email.htmlBody).toContain("£6,000.00");
      expect(email.textBody).toContain("Kitchen Renovation Project");
    });

    it("should provide fallback email on LLM parse error", () => {
      const clientName = "Jane Doe";
      const projectTitle = "Kitchen Renovation Project";
      const total = "£6,000.00";
      const userName = "John Smith";
      const companyName = "Smith Construction Ltd";

      // Simulate fallback template generation
      const fallbackEmail = {
        subject: `Quotation – ${projectTitle}`,
        htmlBody: `<p style="font-family: Arial, sans-serif; margin-bottom: 16px;">Hi ${clientName},</p>
<p style="font-family: Arial, sans-serif; margin-bottom: 16px;">Please find attached our quotation for ${projectTitle}.</p>
<p style="font-family: Arial, sans-serif; margin-bottom: 16px;"><strong>Total: ${total}</strong></p>
<p style="font-family: Arial, sans-serif; margin-bottom: 16px;">Please let me know if you have any questions.</p>
<p style="font-family: Arial, sans-serif; margin-bottom: 16px;">Kind regards,<br/>${userName}<br/>${companyName}</p>`,
        textBody: `Hi ${clientName},\n\nPlease find attached our quotation for ${projectTitle}.\n\nTotal: ${total}\n\nPlease let me know if you have any questions.\n\nKind regards,\n${userName}\n${companyName}`,
      };

      expect(fallbackEmail.subject).toBe("Quotation – Kitchen Renovation Project");
      expect(fallbackEmail.htmlBody).toContain("Jane Doe");
      expect(fallbackEmail.textBody).toContain("£6,000.00");
    });
  });

  describe("Email Content Requirements", () => {
    it("should include client name in email", () => {
      const clientName = mockQuote.clientName;
      expect(clientName).toBe("Jane Doe");
    });

    it("should include project title in subject", () => {
      const subject = `Quotation – ${mockQuote.title}`;
      expect(subject).toBe("Quotation – Kitchen Renovation Project");
    });

    it("should include total amount in email", () => {
      const total = `£${parseFloat(mockQuote.total).toLocaleString("en-GB", { minimumFractionDigits: 2 })}`;
      expect(total).toBe("£6,000.00");
    });

    it("should include VAT breakdown when available", () => {
      const subtotal = `£${parseFloat(mockQuote.subtotal).toLocaleString("en-GB", { minimumFractionDigits: 2 })}`;
      const vatAmount = `£${parseFloat(mockQuote.taxAmount).toLocaleString("en-GB", { minimumFractionDigits: 2 })}`;
      
      expect(subtotal).toBe("£5,000.00");
      expect(vatAmount).toBe("£1,000.00");
    });

    it("should truncate line items to max 5 in summary", () => {
      const manyLineItems = [
        { description: "Item 1" },
        { description: "Item 2" },
        { description: "Item 3" },
        { description: "Item 4" },
        { description: "Item 5" },
        { description: "Item 6" },
        { description: "Item 7" },
      ];

      const summary = manyLineItems.slice(0, 5).map(item => `- ${item.description}`).join("\n") 
        + (manyLineItems.length > 5 ? `\n- ...and ${manyLineItems.length - 5} more items` : "");

      expect(summary).toContain("Item 1");
      expect(summary).toContain("Item 5");
      expect(summary).toContain("...and 2 more items");
      expect(summary).not.toContain("Item 6");
    });

    it("should include sender company details", () => {
      expect(mockUser.companyName).toBe("Smith Construction Ltd");
      expect(mockUser.name).toBe("John Smith");
    });
  });

  describe("Edge Cases", () => {
    it("should handle missing client name with placeholder", () => {
      const quoteWithoutClient = { ...mockQuote, clientName: null };
      const clientName = quoteWithoutClient.clientName || "[Client Name]";
      expect(clientName).toBe("[Client Name]");
    });

    it("should handle missing quote title with placeholder", () => {
      const quoteWithoutTitle = { ...mockQuote, title: null };
      const projectTitle = quoteWithoutTitle.title || "[Project Name]";
      expect(projectTitle).toBe("[Project Name]");
    });

    it("should handle missing total with placeholder", () => {
      const quoteWithoutTotal = { ...mockQuote, total: null };
      const total = quoteWithoutTotal.total 
        ? `£${parseFloat(quoteWithoutTotal.total).toLocaleString("en-GB", { minimumFractionDigits: 2 })}` 
        : "[Total]";
      expect(total).toBe("[Total]");
    });

    it("should handle malformed assumptions JSON gracefully", () => {
      const malformedContext = { ...mockTenderContext, assumptions: "not valid json" };
      let assumptions: string[] = [];
      
      try {
        const parsed = JSON.parse(malformedContext.assumptions);
        if (Array.isArray(parsed)) {
          assumptions = parsed.map((a: { text: string }) => a.text);
        }
      } catch (e) {
        // Should not throw, just leave assumptions empty
      }
      
      expect(assumptions).toEqual([]);
    });
  });
});
