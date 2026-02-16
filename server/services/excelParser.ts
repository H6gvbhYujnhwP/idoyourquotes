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
    // Read the workbook - use all options to capture maximum data
    const workbook = XLSX.read(buffer, { 
      type: 'buffer',
      cellFormula: true,
      cellNF: true,
      cellDates: true,
    });
    
    const sheets: SheetData[] = [];
    let totalRows = 0;
    let totalColumns = 0;
    const textParts: string[] = [];
    
    // Process each sheet
    for (const sheetName of workbook.SheetNames) {
      const worksheet = workbook.Sheets[sheetName];
      
      if (!worksheet['!ref']) continue;
      const range = XLSX.utils.decode_range(worksheet['!ref']);
      
      // Get headers from the first row
      const headers: string[] = [];
      for (let col = range.s.c; col <= range.e.c; col++) {
        const cellAddress = XLSX.utils.encode_cell({ r: range.s.r, c: col });
        const cell = worksheet[cellAddress];
        headers.push(cell ? String(cell.v) : `Column ${col + 1}`);
      }
      
      // Walk cells directly to capture ALL values including numbers
      // This is more reliable than sheet_to_json for unusual XLS formats
      // where quantities may be stored in non-standard ways
      const rows: Record<string, string | number | boolean | null>[] = [];
      for (let row = range.s.r + 1; row <= range.e.r; row++) {
        const rowData: Record<string, string | number | boolean | null> = {};
        let hasData = false;
        
        for (let col = range.s.c; col <= range.e.c; col++) {
          const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
          const cell = worksheet[cellAddress];
          const header = headers[col - range.s.c] || `Column ${col + 1}`;
          
          if (cell) {
            // Use raw value (v) which preserves numbers, then formatted value (w) as fallback
            if (cell.v !== null && cell.v !== undefined) {
              rowData[header] = cell.v;
              hasData = true;
            } else if (cell.w) {
              rowData[header] = cell.w;
              hasData = true;
            }
          } else {
            rowData[header] = null;
          }
        }
        
        if (hasData) {
          rows.push(rowData);
        }
      }
      
      // Also try sheet_to_json with raw values as secondary extraction
      const jsonData = XLSX.utils.sheet_to_json<Record<string, string | number | boolean | null>>(worksheet, {
        defval: null,
        raw: true // Keep raw values (numbers as numbers, not formatted strings)
      });
      
      // Use whichever extraction found more rows
      let finalRows = rows.length >= jsonData.length ? rows : jsonData;
      
      // If both have same row count, merge — fill gaps from sheet_to_json into direct walk
      if (rows.length === jsonData.length && rows.length > 0) {
        for (let i = 0; i < rows.length; i++) {
          for (const h of headers) {
            if ((rows[i][h] === null || rows[i][h] === undefined) && 
                jsonData[i][h] !== null && jsonData[i][h] !== undefined) {
              rows[i][h] = jsonData[i][h];
            }
          }
        }
        finalRows = rows;
      }
      
      // Convert to plain text for AI processing
      const textLines: string[] = [];
      textLines.push(`=== Sheet: ${sheetName} ===`);
      textLines.push(`Headers: ${headers.join(' | ')}`);
      textLines.push('');
      
      for (const row of finalRows) {
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
        rows: finalRows,
        rawText
      });
      
      totalRows += finalRows.length;
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
