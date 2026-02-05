import mammoth from 'mammoth';

export interface WordParseResult {
  text: string;
  html: string;
  messages: string[];
}

/**
 * Parse a Word document (.doc, .docx) and extract text content
 * @param buffer - The file buffer containing the Word document
 * @returns Parsed text content and any conversion messages
 */
export async function parseWordDocument(buffer: Buffer): Promise<WordParseResult> {
  try {
    // Extract raw text (best for AI processing)
    const textResult = await mammoth.extractRawText({ buffer });
    
    // Also extract HTML for potential display purposes
    const htmlResult = await mammoth.convertToHtml({ buffer });
    
    // Combine messages from both operations
    const messages = [
      ...textResult.messages.map(m => m.message),
      ...htmlResult.messages.map(m => m.message)
    ];
    
    return {
      text: textResult.value.trim(),
      html: htmlResult.value,
      messages
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error parsing Word document';
    throw new Error(`Failed to parse Word document: ${errorMessage}`);
  }
}

/**
 * Check if a file is a Word document based on MIME type or extension
 */
export function isWordDocument(mimeType: string, filename: string): boolean {
  const wordMimeTypes = [
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ];
  
  const wordExtensions = ['.doc', '.docx'];
  const ext = filename.toLowerCase().slice(filename.lastIndexOf('.'));
  
  return wordMimeTypes.includes(mimeType) || wordExtensions.includes(ext);
}
