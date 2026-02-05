import * as XLSX from 'xlsx';

export interface ExcelParseResult {
  text: string;
  sheets: SheetData[];
  totalRows: number;
  totalColumns: number;
}

export interface SheetData {
  name: string;
  headers: string[];
  rows: Record<string, string | number | boolean | null>[];
  rawText: string;
}

/**
 * Parse an Excel or CSV file and extract structured data
 * @param buffer - The file buffer containing the spreadsheet
 * @param filename - Original filename to help determine format
 * @returns Parsed spreadsheet data with text representation
 */
export async function parseSpreadsheet(buffer: Buffer, filename: string): Promise<ExcelParseResult> {
  try {
    // Read the workbook
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    
    const sheets: SheetData[] = [];
    let totalRows = 0;
    let totalColumns = 0;
    const textParts: string[] = [];
    
    // Process each sheet
    for (const sheetName of workbook.SheetNames) {
      const worksheet = workbook.Sheets[sheetName];
      
      // Convert to JSON with headers
      const jsonData = XLSX.utils.sheet_to_json<Record<string, string | number | boolean | null>>(worksheet, {
        defval: null,
        raw: false // Convert all values to strings for consistency
      });
      
      // Get headers from the first row
      const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
      const headers: string[] = [];
      for (let col = range.s.c; col <= range.e.c; col++) {
        const cellAddress = XLSX.utils.encode_cell({ r: range.s.r, c: col });
        const cell = worksheet[cellAddress];
        headers.push(cell ? String(cell.v) : `Column ${col + 1}`);
      }
      
      // Convert to plain text for AI processing
      const textLines: string[] = [];
      textLines.push(`=== Sheet: ${sheetName} ===`);
      textLines.push(`Headers: ${headers.join(' | ')}`);
      textLines.push('');
      
      for (const row of jsonData) {
        const rowValues = headers.map(h => {
          const val = row[h];
          return val !== null && val !== undefined ? String(val) : '';
        });
        textLines.push(rowValues.join(' | '));
      }
      
      const rawText = textLines.join('\n');
      textParts.push(rawText);
      
      sheets.push({
        name: sheetName,
        headers,
        rows: jsonData,
        rawText
      });
      
      totalRows += jsonData.length;
      totalColumns = Math.max(totalColumns, headers.length);
    }
    
    return {
      text: textParts.join('\n\n'),
      sheets,
      totalRows,
      totalColumns
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error parsing spreadsheet';
    throw new Error(`Failed to parse spreadsheet: ${errorMessage}`);
  }
}

/**
 * Check if a file is a spreadsheet based on MIME type or extension
 */
export function isSpreadsheet(mimeType: string, filename: string): boolean {
  const spreadsheetMimeTypes = [
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv',
    'application/csv'
  ];
  
  const spreadsheetExtensions = ['.xls', '.xlsx', '.csv'];
  const ext = filename.toLowerCase().slice(filename.lastIndexOf('.'));
  
  return spreadsheetMimeTypes.includes(mimeType) || spreadsheetExtensions.includes(ext);
}

/**
 * Format spreadsheet data as a structured prompt for AI
 */
export function formatSpreadsheetForAI(result: ExcelParseResult): string {
  const lines: string[] = [];
  lines.push(`Spreadsheet contains ${result.sheets.length} sheet(s) with ${result.totalRows} total rows.`);
  lines.push('');
  
  for (const sheet of result.sheets) {
    lines.push(`Sheet "${sheet.name}":`);
    lines.push(`- Columns: ${sheet.headers.join(', ')}`);
    lines.push(`- Rows: ${sheet.rows.length}`);
    lines.push('');
    lines.push('Data:');
    lines.push(sheet.rawText);
    lines.push('');
  }
  
  return lines.join('\n');
}
