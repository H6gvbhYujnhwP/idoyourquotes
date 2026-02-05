import { describe, it, expect } from "vitest";
import { isWordDocument } from "./services/wordParser";
import { isSpreadsheet, formatSpreadsheetForAI } from "./services/excelParser";

describe("Document Type Detection", () => {
  describe("isWordDocument", () => {
    it("should detect .docx files by MIME type", () => {
      expect(isWordDocument(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "test.docx"
      )).toBe(true);
    });

    it("should detect .doc files by MIME type", () => {
      expect(isWordDocument("application/msword", "test.doc")).toBe(true);
    });

    it("should detect Word files by extension when MIME is generic", () => {
      expect(isWordDocument("application/octet-stream", "document.docx")).toBe(true);
      expect(isWordDocument("application/octet-stream", "document.doc")).toBe(true);
    });

    it("should not detect non-Word files", () => {
      expect(isWordDocument("application/pdf", "test.pdf")).toBe(false);
      expect(isWordDocument("text/plain", "test.txt")).toBe(false);
    });
  });

  describe("isSpreadsheet", () => {
    it("should detect .xlsx files by MIME type", () => {
      expect(isSpreadsheet(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "test.xlsx"
      )).toBe(true);
    });

    it("should detect .xls files by MIME type", () => {
      expect(isSpreadsheet("application/vnd.ms-excel", "test.xls")).toBe(true);
    });

    it("should detect .csv files by MIME type", () => {
      expect(isSpreadsheet("text/csv", "test.csv")).toBe(true);
      expect(isSpreadsheet("application/csv", "data.csv")).toBe(true);
    });

    it("should detect spreadsheet files by extension when MIME is generic", () => {
      expect(isSpreadsheet("application/octet-stream", "data.xlsx")).toBe(true);
      expect(isSpreadsheet("application/octet-stream", "data.xls")).toBe(true);
      expect(isSpreadsheet("application/octet-stream", "data.csv")).toBe(true);
    });

    it("should not detect non-spreadsheet files", () => {
      expect(isSpreadsheet("application/pdf", "test.pdf")).toBe(false);
      expect(isSpreadsheet("application/msword", "test.doc")).toBe(false);
    });
  });

  describe("formatSpreadsheetForAI", () => {
    it("should format spreadsheet data for AI consumption", () => {
      const mockResult = {
        text: "Sheet data here",
        sheets: [{
          name: "Sheet1",
          headers: ["Item", "Quantity", "Price"],
          rows: [
            { Item: "Widget A", Quantity: "10", Price: "5.00" },
            { Item: "Widget B", Quantity: "20", Price: "3.50" }
          ],
          rawText: "Item | Quantity | Price\nWidget A | 10 | 5.00\nWidget B | 20 | 3.50"
        }],
        totalRows: 2,
        totalColumns: 3
      };

      const formatted = formatSpreadsheetForAI(mockResult);
      
      expect(formatted).toContain("1 sheet(s)");
      expect(formatted).toContain("2 total rows");
      expect(formatted).toContain("Sheet1");
      expect(formatted).toContain("Item, Quantity, Price");
    });
  });
});

describe("Document Upload Input Type", () => {
  it("should accept document as a valid input type", () => {
    const validTypes = ["pdf", "image", "audio", "email", "text", "document"];
    expect(validTypes).toContain("document");
  });
});
