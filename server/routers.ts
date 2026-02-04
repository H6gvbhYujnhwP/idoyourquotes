import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { invokeLLM } from "./_core/llm";
import { uploadToR2, getPresignedUrl, deleteFromR2, isR2Configured } from "./r2Storage";
import { generateQuoteHTML } from "./pdfGenerator";
import {
  getQuotesByUserId,
  getQuotesByOrgId,
  getQuoteById,
  getQuoteByIdAndOrg,
  createQuote,
  updateQuote,
  updateQuoteStatus,
  deleteQuote,
  getLineItemsByQuoteId,
  createLineItem,
  updateLineItem,
  deleteLineItem,
  getInputsByQuoteId,
  createInput,
  deleteInput,
  getInputById,
  updateInputProcessing,
  getTenderContextByQuoteId,
  upsertTenderContext,
  getInternalEstimateByQuoteId,
  upsertInternalEstimate,
  getCatalogItemsByUserId,
  getCatalogItemsByOrgId,
  createCatalogItem,
  updateCatalogItem,
  deleteCatalogItem,
  recalculateQuoteTotals,
  updateUserProfile,
  changePassword,
  getUserPrimaryOrg,
  getOrganizationById,
  logUsage,
} from "./db";
import { transcribeAudio } from "./_core/voiceTranscription";

export const appRouter = router({
  system: systemRouter,
  
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
    updateProfile: protectedProcedure
      .input(z.object({
        name: z.string().optional(),
        companyName: z.string().optional(),
        companyAddress: z.string().optional(),
        companyPhone: z.string().optional(),
        companyEmail: z.string().optional(),
        defaultTerms: z.string().optional(),
        companyLogo: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        return updateUserProfile(ctx.user.id, input);
      }),
    uploadLogo: protectedProcedure
      .input(z.object({
        filename: z.string(),
        contentType: z.string(),
        base64Data: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!isR2Configured()) {
          throw new Error("File storage is not configured");
        }

        // Decode base64 to buffer
        const buffer = Buffer.from(input.base64Data, "base64");

        // Upload to R2 with user-specific folder
        const folder = `logos/${ctx.user.id}`;
        const { key, url } = await uploadToR2(
          buffer,
          input.filename,
          input.contentType,
          folder
        );

        // Update user profile with logo URL
        const user = await updateUserProfile(ctx.user.id, { companyLogo: url });

        return { url, key, user };
      }),
    changePassword: protectedProcedure
      .input(z.object({
        currentPassword: z.string(),
        newPassword: z.string().min(8),
      }))
      .mutation(async ({ ctx, input }) => {
        const success = await changePassword(ctx.user.id, input.currentPassword, input.newPassword);
        if (!success) {
          throw new Error("Current password is incorrect");
        }
        return { success: true };
      }),
  }),

  // ============ QUOTES ============
  quotes: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      // Get user's primary organization
      const org = await getUserPrimaryOrg(ctx.user.id);
      if (org) {
        // Use org-based access for multi-tenant isolation
        return getQuotesByOrgId(org.id);
      }
      // Fallback to user-based access for users without orgs (legacy)
      return getQuotesByUserId(ctx.user.id);
    }),

    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        // Try org-based access first
        const org = await getUserPrimaryOrg(ctx.user.id);
        if (org) {
          const quote = await getQuoteByIdAndOrg(input.id, org.id);
          if (quote) return quote;
        }
        // Fallback to user-based access
        const quote = await getQuoteById(input.id, ctx.user.id);
        if (!quote) throw new Error("Quote not found");
        return quote;
      }),

    create: protectedProcedure
      .input(z.object({
        title: z.string().optional(),
        clientName: z.string().optional(),
        clientEmail: z.string().optional(),
        clientPhone: z.string().optional(),
        clientAddress: z.string().optional(),
        description: z.string().optional(),
        terms: z.string().optional(),
      }).optional())
      .mutation(async ({ ctx, input }) => {
        // Get user's organization to set orgId
        const org = await getUserPrimaryOrg(ctx.user.id);
        return createQuote({
          userId: ctx.user.id,
          orgId: org?.id,
          ...input,
        });
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        title: z.string().optional(),
        reference: z.string().optional(),
        status: z.enum(["draft", "sent", "accepted", "declined"]).optional(),
        clientName: z.string().optional(),
        clientEmail: z.string().optional(),
        clientPhone: z.string().optional(),
        clientAddress: z.string().optional(),
        description: z.string().optional(),
        terms: z.string().optional(),
        validUntil: z.date().optional(),
        taxRate: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { id, ...data } = input;
        const quote = await updateQuote(id, ctx.user.id, data);
        if (!quote) throw new Error("Quote not found");
        
        // Recalculate totals if tax rate changed
        if (data.taxRate !== undefined) {
          return recalculateQuoteTotals(id, ctx.user.id);
        }
        return quote;
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await deleteQuote(input.id, ctx.user.id);
        return { success: true };
      }),

    // Update quote status with validation
    updateStatus: protectedProcedure
      .input(z.object({
        id: z.number(),
        status: z.enum(["draft", "sent", "accepted", "declined"]),
      }))
      .mutation(async ({ ctx, input }) => {
        // Get current quote to validate transition
        const currentQuote = await getQuoteById(input.id, ctx.user.id);
        if (!currentQuote) throw new Error("Quote not found");

        // Validate status transitions
        const validTransitions: Record<string, string[]> = {
          draft: ["sent"],
          sent: ["accepted", "declined", "draft"],
          accepted: ["draft"], // Allow reverting to draft
          declined: ["draft"], // Allow reverting to draft
        };

        const currentStatus = currentQuote.status;
        if (!validTransitions[currentStatus]?.includes(input.status)) {
          throw new Error(`Cannot change status from ${currentStatus} to ${input.status}`);
        }

        const quote = await updateQuoteStatus(input.id, ctx.user.id, input.status);
        if (!quote) throw new Error("Failed to update quote status");
        return quote;
      }),

    // Get full quote with all related data
    getFull: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        const quote = await getQuoteById(input.id, ctx.user.id);
        if (!quote) throw new Error("Quote not found");

        const [lineItems, inputs, tenderContext, internalEstimate] = await Promise.all([
          getLineItemsByQuoteId(input.id),
          getInputsByQuoteId(input.id),
          getTenderContextByQuoteId(input.id),
          getInternalEstimateByQuoteId(input.id),
        ]);

        return {
          quote,
          lineItems,
          inputs,
          tenderContext,
          internalEstimate,
        };
      }),

    // Generate PDF HTML for a quote
    generatePDF: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        const quote = await getQuoteById(input.id, ctx.user.id);
        if (!quote) throw new Error("Quote not found");

        const lineItems = await getLineItemsByQuoteId(input.id);
        const user = ctx.user;

        const html = generateQuoteHTML({ quote, lineItems, user });
        return { html };
      }),

    // Generate email draft for a quote
    generateEmail: protectedProcedure
      .input(z.object({
        id: z.number(),
        tone: z.enum(["neutral", "formal", "friendly"]).optional().default("neutral"),
        includeSummary: z.boolean().optional().default(true),
      }))
      .mutation(async ({ ctx, input }) => {
        const quote = await getQuoteById(input.id, ctx.user.id);
        if (!quote) throw new Error("Quote not found");

        const lineItems = await getLineItemsByQuoteId(input.id);
        const tenderContext = await getTenderContextByQuoteId(input.id);
        const user = ctx.user;

        // Build context for email generation
        const clientName = quote.clientName || "[Client Name]";
        const projectTitle = quote.title || "[Project Name]";
        const total = quote.total ? `£${parseFloat(quote.total).toLocaleString("en-GB", { minimumFractionDigits: 2 })}` : "[Total]";
        const vatAmount = quote.taxAmount ? `£${parseFloat(quote.taxAmount).toLocaleString("en-GB", { minimumFractionDigits: 2 })}` : null;
        const subtotal = quote.subtotal ? `£${parseFloat(quote.subtotal).toLocaleString("en-GB", { minimumFractionDigits: 2 })}` : null;

        // Build line items summary (high-level only)
        const lineItemsSummary = lineItems.length > 0
          ? lineItems.slice(0, 5).map(item => `- ${item.description}`).join("\n") + (lineItems.length > 5 ? `\n- ...and ${lineItems.length - 5} more items` : "")
          : "[No line items specified]";

        // Get client-safe assumptions/exclusions only
        let assumptions: string[] = [];
        let exclusions: string[] = [];
        try {
          if (tenderContext?.assumptions) {
            const parsed = typeof tenderContext.assumptions === "string" 
              ? JSON.parse(tenderContext.assumptions) 
              : tenderContext.assumptions;
            if (Array.isArray(parsed)) {
              assumptions = parsed.slice(0, 3).map((a: { text: string }) => a.text);
            }
          }
          if (tenderContext?.exclusions) {
            const parsed = typeof tenderContext.exclusions === "string" 
              ? JSON.parse(tenderContext.exclusions) 
              : tenderContext.exclusions;
            if (Array.isArray(parsed)) {
              exclusions = parsed.slice(0, 3).map((e: { text: string }) => e.text);
            }
          }
        } catch (e) {
          // Ignore parsing errors
        }

        // Build key notes from assumptions and exclusions
        const keyNotes = [
          ...assumptions.map((a: string) => `Assumption: ${a}`),
          ...exclusions.map((e: string) => `Exclusion: ${e}`),
        ];

        // Generate email using LLM
        const response = await invokeLLM({
          messages: [
            {
              role: "system",
              content: `You are a professional business email writer. Generate a quotation email that the user will copy/paste into Gmail or Outlook.

STRICT RULES:
- Tone: ${input.tone}, confident, plain English
- NO emojis
- NO AI language ("I've analyzed", "Based on my review", etc.)
- NO internal notes or confidence scores
- NO invented details - only use what's provided
- Use [placeholders] for any missing information
- Maximum 3 bold headings (use <strong> tags)
- Keep it SHORT and practical
- NO long preambles or fluffy language

You MUST respond with valid JSON:
{
  "subject": "Quotation – [Project Reference]",
  "htmlBody": "<html email body with minimal formatting>",
  "textBody": "plain text version"
}

Email structure:
1. Subject: "Quotation – [Project/Reference]"
2. Greeting: "Hi [Name],"
3. 1-2 sentence intro referencing the attached quote PDF
4. ${input.includeSummary ? "Summary section with total and high-level scope" : "Skip summary"}
5. Key notes section with 3-6 bullet points (only known facts)
6. Close: invite questions + professional sign-off

HTML formatting rules:
- Use <p> for paragraphs with margin-bottom: 16px
- Use <ul><li> for bullet points
- Use <strong> sparingly for headings only
- Font: Arial, sans-serif
- No background colors or complex styling`,
            },
            {
              role: "user",
              content: `Generate a quotation email with this context:

Client Name: ${clientName}
Project/Quote Title: ${projectTitle}
Quote Reference: ${quote.reference || "Q-" + quote.id}
Total (inc VAT): ${total}${subtotal ? `\nSubtotal: ${subtotal}` : ""}${vatAmount ? `\nVAT: ${vatAmount}` : ""}

Scope Summary:\n${lineItemsSummary}

${keyNotes.length > 0 ? `Key Notes:\n${keyNotes.join("\n")}` : "No specific notes."}

Sender Company: ${user.companyName || "[Your Company]"}
Sender Name: ${user.name || "[Your Name]"}`,
            },
          ],
          response_format: { type: "json_object" },
        });

        const content = response.choices[0]?.message?.content;
        const responseText = typeof content === "string" ? content : "";

        try {
          const email = JSON.parse(responseText);

          // Log usage for billing
          const org = await getUserPrimaryOrg(ctx.user.id);
          if (org) {
            await logUsage({
              orgId: org.id,
              userId: ctx.user.id,
              actionType: "generate_email",
              creditsUsed: 1,
              metadata: { quoteId: input.id },
            });
          }

          return {
            subject: email.subject || `Quotation – ${projectTitle}`,
            htmlBody: email.htmlBody || "",
            textBody: email.textBody || "",
          };
        } catch (parseError) {
          console.error("Failed to parse email response:", parseError);
          // Return a fallback template
          return {
            subject: `Quotation – ${projectTitle}`,
            htmlBody: `<p style="font-family: Arial, sans-serif; margin-bottom: 16px;">Hi ${clientName},</p>
<p style="font-family: Arial, sans-serif; margin-bottom: 16px;">Please find attached our quotation for ${projectTitle}.</p>
<p style="font-family: Arial, sans-serif; margin-bottom: 16px;"><strong>Total: ${total}</strong></p>
<p style="font-family: Arial, sans-serif; margin-bottom: 16px;">Please let me know if you have any questions.</p>
<p style="font-family: Arial, sans-serif; margin-bottom: 16px;">Kind regards,<br/>${user.name || "[Your Name]"}<br/>${user.companyName || ""}</p>`,
            textBody: `Hi ${clientName},\n\nPlease find attached our quotation for ${projectTitle}.\n\nTotal: ${total}\n\nPlease let me know if you have any questions.\n\nKind regards,\n${user.name || "[Your Name]"}\n${user.companyName || ""}`,
          };
        }
      }),
  }),

  // ============ LINE ITEMS ============
  lineItems: router({
    list: protectedProcedure
      .input(z.object({ quoteId: z.number() }))
      .query(async ({ ctx, input }) => {
        // Verify quote ownership
        const quote = await getQuoteById(input.quoteId, ctx.user.id);
        if (!quote) throw new Error("Quote not found");
        return getLineItemsByQuoteId(input.quoteId);
      }),

    create: protectedProcedure
      .input(z.object({
        quoteId: z.number(),
        description: z.string(),
        quantity: z.string().optional(),
        unit: z.string().optional(),
        rate: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        // Verify quote ownership
        const quote = await getQuoteById(input.quoteId, ctx.user.id);
        if (!quote) throw new Error("Quote not found");

        const quantity = parseFloat(input.quantity || "1");
        const rate = parseFloat(input.rate || "0");
        const total = (quantity * rate).toFixed(2);

        const item = await createLineItem({
          quoteId: input.quoteId,
          description: input.description,
          quantity: input.quantity || "1",
          unit: input.unit || "each",
          rate: input.rate || "0.00",
          total,
        });

        // Recalculate quote totals
        await recalculateQuoteTotals(input.quoteId, ctx.user.id);

        return item;
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        quoteId: z.number(),
        description: z.string().optional(),
        quantity: z.string().optional(),
        unit: z.string().optional(),
        rate: z.string().optional(),
        sortOrder: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        // Verify quote ownership
        const quote = await getQuoteById(input.quoteId, ctx.user.id);
        if (!quote) throw new Error("Quote not found");

        const { id, quoteId, ...data } = input;

        // Recalculate total if quantity or rate changed
        if (data.quantity !== undefined || data.rate !== undefined) {
          const existingItems = await getLineItemsByQuoteId(quoteId);
          const existingItem = existingItems.find(i => i.id === id);
          if (existingItem) {
            const quantity = parseFloat(data.quantity || existingItem.quantity || "1");
            const rate = parseFloat(data.rate || existingItem.rate || "0");
            (data as any).total = (quantity * rate).toFixed(2);
          }
        }

        const item = await updateLineItem(id, data);

        // Recalculate quote totals
        await recalculateQuoteTotals(quoteId, ctx.user.id);

        return item;
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number(), quoteId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        // Verify quote ownership
        const quote = await getQuoteById(input.quoteId, ctx.user.id);
        if (!quote) throw new Error("Quote not found");

        await deleteLineItem(input.id);

        // Recalculate quote totals
        await recalculateQuoteTotals(input.quoteId, ctx.user.id);

        return { success: true };
      }),
  }),

  // ============ INPUTS ============
  inputs: router({
    list: protectedProcedure
      .input(z.object({ quoteId: z.number() }))
      .query(async ({ ctx, input }) => {
        const quote = await getQuoteById(input.quoteId, ctx.user.id);
        if (!quote) throw new Error("Quote not found");
        return getInputsByQuoteId(input.quoteId);
      }),

    create: protectedProcedure
      .input(z.object({
        quoteId: z.number(),
        inputType: z.enum(["pdf", "image", "audio", "email", "text"]),
        filename: z.string().optional(),
        fileUrl: z.string().optional(),
        fileKey: z.string().optional(),
        content: z.string().optional(),
        mimeType: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const quote = await getQuoteById(input.quoteId, ctx.user.id);
        if (!quote) throw new Error("Quote not found");

        return createInput(input);
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number(), quoteId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const quote = await getQuoteById(input.quoteId, ctx.user.id);
        if (!quote) throw new Error("Quote not found");

        // Get the input record to find the file key before deleting
        const inputRecord = await getInputById(input.id);
        if (!inputRecord) throw new Error("Input not found");

        // Verify the input belongs to this quote
        if (inputRecord.quoteId !== input.quoteId) {
          throw new Error("Input does not belong to this quote");
        }

        // Delete the file from R2 storage if it exists
        if (inputRecord.fileKey && isR2Configured()) {
          try {
            await deleteFromR2(inputRecord.fileKey);
            console.log(`[R2] Deleted file: ${inputRecord.fileKey}`);
          } catch (r2Error) {
            // Log but don't fail the deletion if R2 delete fails
            console.error(`[R2] Failed to delete file ${inputRecord.fileKey}:`, r2Error);
          }
        }

        // Delete the database record
        await deleteInput(input.id);
        return { success: true };
      }),

    // File upload via base64
    uploadFile: protectedProcedure
      .input(z.object({
        quoteId: z.number(),
        filename: z.string(),
        contentType: z.string(),
        base64Data: z.string(),
        inputType: z.enum(["pdf", "image", "audio", "email"]),
      }))
      .mutation(async ({ ctx, input }) => {
        const quote = await getQuoteById(input.quoteId, ctx.user.id);
        if (!quote) throw new Error("Quote not found");

        if (!isR2Configured()) {
          throw new Error("File storage is not configured");
        }

        // Decode base64 to buffer
        const buffer = Buffer.from(input.base64Data, "base64");

        // Upload to R2 with org-scoped folder structure for multi-tenancy
        // Use org slug and quote reference for better traceability in Cloudflare
        const org = await getUserPrimaryOrg(ctx.user.id);
        const orgFolder = org ? org.slug : `user-${ctx.user.id}`;
        const folder = `orgs/${orgFolder}/quotes/${quote.reference || input.quoteId}`;
        const { key, url } = await uploadToR2(
          buffer,
          input.filename,
          input.contentType,
          folder
        );

        // Create input record
        const inputRecord = await createInput({
          quoteId: input.quoteId,
          inputType: input.inputType,
          filename: input.filename,
          fileUrl: url,
          fileKey: key,
          mimeType: input.contentType,
        });

        return inputRecord;
      }),

    // Get fresh presigned URL for a file
    getFileUrl: protectedProcedure
      .input(z.object({ quoteId: z.number(), fileKey: z.string() }))
      .query(async ({ ctx, input }) => {
        const quote = await getQuoteById(input.quoteId, ctx.user.id);
        if (!quote) throw new Error("Quote not found");

        const url = await getPresignedUrl(input.fileKey);
        return { url };
      }),

    // Check if storage is configured
    storageStatus: protectedProcedure.query(() => {
      return { configured: isR2Configured() };
    }),

    // Process an audio input (transcribe)
    transcribeAudio: protectedProcedure
      .input(z.object({ inputId: z.number(), quoteId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const quote = await getQuoteById(input.quoteId, ctx.user.id);
        if (!quote) throw new Error("Quote not found");

        const inputRecord = await getInputById(input.inputId);
        if (!inputRecord || inputRecord.quoteId !== input.quoteId) {
          throw new Error("Input not found");
        }

        if (inputRecord.inputType !== "audio") {
          throw new Error("Input is not an audio file");
        }

        if (!inputRecord.fileUrl) {
          throw new Error("No file URL for this input");
        }

        // Mark as processing
        await updateInputProcessing(input.inputId, {
          processingStatus: "processing",
          processingError: null,
        });

        try {
          const result = await transcribeAudio({ audioUrl: inputRecord.fileUrl });
          
          if ("error" in result) {
            await updateInputProcessing(input.inputId, {
              processingStatus: "failed",
              processingError: result.error,
            });
            throw new Error(result.error);
          }

          // Save transcription
          const updated = await updateInputProcessing(input.inputId, {
            processedContent: result.text,
            processingStatus: "completed",
            processingError: null,
          });

          // Log usage for billing
          const org = await getUserPrimaryOrg(ctx.user.id);
          if (org) {
            await logUsage({
              orgId: org.id,
              userId: ctx.user.id,
              actionType: "transcribe_audio",
              creditsUsed: 2,
              metadata: { quoteId: input.quoteId, inputId: input.inputId },
            });
          }

          return { transcription: result.text, input: updated };
        } catch (error) {
          await updateInputProcessing(input.inputId, {
            processingStatus: "failed",
            processingError: error instanceof Error ? error.message : "Unknown error",
          });
          throw error;
        }
      }),

    // Process a PDF input (extract text)
    extractPdfText: protectedProcedure
      .input(z.object({ inputId: z.number(), quoteId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const quote = await getQuoteById(input.quoteId, ctx.user.id);
        if (!quote) throw new Error("Quote not found");

        const inputRecord = await getInputById(input.inputId);
        if (!inputRecord || inputRecord.quoteId !== input.quoteId) {
          throw new Error("Input not found");
        }

        if (inputRecord.inputType !== "pdf") {
          throw new Error("Input is not a PDF file");
        }

        if (!inputRecord.fileUrl) {
          throw new Error("No file URL for this input");
        }

        // Mark as processing
        await updateInputProcessing(input.inputId, {
          processingStatus: "processing",
          processingError: null,
        });

        try {
          // Use LLM with file_url to extract text from PDF
          const response = await invokeLLM({
            messages: [
              {
                role: "system",
                content: "You are a document text extractor. Extract all text content from the provided PDF document. Preserve the structure and formatting as much as possible. Include all text, tables, and any visible content.",
              },
              {
                role: "user",
                content: [
                  {
                    type: "file_url",
                    file_url: {
                      url: inputRecord.fileUrl,
                      mime_type: "application/pdf",
                    },
                  },
                  {
                    type: "text",
                    text: "Please extract all text content from this PDF document.",
                  },
                ],
              },
            ],
          });

          const extractedText = typeof response.choices[0]?.message?.content === "string"
            ? response.choices[0].message.content
            : "";

          const updated = await updateInputProcessing(input.inputId, {
            processedContent: extractedText,
            processingStatus: "completed",
            processingError: null,
          });

          // Log usage for billing
          const org = await getUserPrimaryOrg(ctx.user.id);
          if (org) {
            await logUsage({
              orgId: org.id,
              userId: ctx.user.id,
              actionType: "extract_pdf",
              creditsUsed: 2,
              metadata: { quoteId: input.quoteId, inputId: input.inputId },
            });
          }

          return { extractedText, input: updated };
        } catch (error) {
          await updateInputProcessing(input.inputId, {
            processingStatus: "failed",
            processingError: error instanceof Error ? error.message : "Unknown error",
          });
          throw error;
        }
      }),

    // Process an image input (OCR + vision analysis)
    analyzeImage: protectedProcedure
      .input(z.object({ inputId: z.number(), quoteId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const quote = await getQuoteById(input.quoteId, ctx.user.id);
        if (!quote) throw new Error("Quote not found");

        const inputRecord = await getInputById(input.inputId);
        if (!inputRecord || inputRecord.quoteId !== input.quoteId) {
          throw new Error("Input not found");
        }

        if (inputRecord.inputType !== "image") {
          throw new Error("Input is not an image file");
        }

        if (!inputRecord.fileUrl) {
          throw new Error("No file URL for this input");
        }

        // Mark as processing
        await updateInputProcessing(input.inputId, {
          processingStatus: "processing",
          processingError: null,
        });

        try {
          // Use LLM vision to analyze image
          const response = await invokeLLM({
            messages: [
              {
                role: "system",
                content: `You are analyzing an image for a quoting/estimation system. This could be a technical drawing, floor plan, specification sheet, or site photo.

Extract and report:
1. **Text Content**: Any visible text, labels, dimensions, measurements, specifications
2. **Symbols & Legends**: Any symbols, abbreviations, or legend items with their meanings
3. **Key Details**: Important features, quantities, materials, or specifications visible
4. **Measurements**: All dimensions, areas, quantities shown
5. **Notes & Warnings**: Any notes, warnings, or special instructions

Be thorough - missed details in drawings often lead to costly errors in quotes.`,
              },
              {
                role: "user",
                content: [
                  {
                    type: "image_url",
                    image_url: {
                      url: inputRecord.fileUrl,
                      detail: "high",
                    },
                  },
                  {
                    type: "text",
                    text: "Please analyze this image thoroughly for quoting purposes. Extract all text, measurements, symbols, and important details.",
                  },
                ],
              },
            ],
          });

          const analysis = typeof response.choices[0]?.message?.content === "string"
            ? response.choices[0].message.content
            : "";

          const updated = await updateInputProcessing(input.inputId, {
            processedContent: analysis,
            processingStatus: "completed",
            processingError: null,
          });

          // Log usage for billing
          const org = await getUserPrimaryOrg(ctx.user.id);
          if (org) {
            await logUsage({
              orgId: org.id,
              userId: ctx.user.id,
              actionType: "analyze_image",
              creditsUsed: 2,
              metadata: { quoteId: input.quoteId, inputId: input.inputId },
            });
          }

          return { analysis, input: updated };
        } catch (error) {
          await updateInputProcessing(input.inputId, {
            processingStatus: "failed",
            processingError: error instanceof Error ? error.message : "Unknown error",
          });
          throw error;
        }
      }),
  }),

  // ============ TENDER CONTEXT ============
  tenderContext: router({
    get: protectedProcedure
      .input(z.object({ quoteId: z.number() }))
      .query(async ({ ctx, input }) => {
        const quote = await getQuoteById(input.quoteId, ctx.user.id);
        if (!quote) throw new Error("Quote not found");
        return getTenderContextByQuoteId(input.quoteId);
      }),

    upsert: protectedProcedure
      .input(z.object({
        quoteId: z.number(),
        symbolMappings: z.record(z.string(), z.object({
          meaning: z.string(),
          confirmed: z.boolean(),
          confidence: z.number().optional(),
        })).optional().nullable(),
        assumptions: z.array(z.object({
          text: z.string(),
          confirmed: z.boolean(),
        })).optional(),
        exclusions: z.array(z.object({
          text: z.string(),
          confirmed: z.boolean(),
        })).optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const quote = await getQuoteById(input.quoteId, ctx.user.id);
        if (!quote) throw new Error("Quote not found");

        const { quoteId, ...data } = input;
        return upsertTenderContext(quoteId, data);
      }),
  }),

  // ============ INTERNAL ESTIMATE ============
  internalEstimate: router({
    get: protectedProcedure
      .input(z.object({ quoteId: z.number() }))
      .query(async ({ ctx, input }) => {
        const quote = await getQuoteById(input.quoteId, ctx.user.id);
        if (!quote) throw new Error("Quote not found");
        return getInternalEstimateByQuoteId(input.quoteId);
      }),

    upsert: protectedProcedure
      .input(z.object({
        quoteId: z.number(),
        notes: z.string().optional(),
        costBreakdown: z.array(z.object({
          item: z.string(),
          cost: z.number(),
          notes: z.string().optional(),
        })).optional(),
        timeEstimates: z.array(z.object({
          task: z.string(),
          hours: z.number(),
          rate: z.number().optional(),
        })).optional(),
        riskNotes: z.string().optional(),
        aiSuggestions: z.array(z.object({
          type: z.string(),
          text: z.string(),
          applied: z.boolean(),
        })).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const quote = await getQuoteById(input.quoteId, ctx.user.id);
        if (!quote) throw new Error("Quote not found");

        const { quoteId, ...data } = input;
        return upsertInternalEstimate(quoteId, data);
      }),
  }),

  // ============ CATALOG ============
  catalog: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      // Get user's primary organization
      const org = await getUserPrimaryOrg(ctx.user.id);
      if (org) {
        // Use org-based access for multi-tenant isolation
        return getCatalogItemsByOrgId(org.id);
      }
      // Fallback to user-based access for users without orgs (legacy)
      return getCatalogItemsByUserId(ctx.user.id);
    }),

    create: protectedProcedure
      .input(z.object({
        name: z.string(),
        description: z.string().optional(),
        category: z.string().optional(),
        unit: z.string().optional(),
        defaultRate: z.string().optional(),
        costPrice: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        // Get user's organization to set orgId
        const org = await getUserPrimaryOrg(ctx.user.id);
        return createCatalogItem({
          userId: ctx.user.id,
          orgId: org?.id,
          ...input,
        });
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().optional(),
        description: z.string().optional(),
        category: z.string().optional(),
        unit: z.string().optional(),
        defaultRate: z.string().optional(),
        costPrice: z.string().optional(),
        isActive: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { id, ...data } = input;
        return updateCatalogItem(id, ctx.user.id, data);
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await deleteCatalogItem(input.id, ctx.user.id);
        return { success: true };
      }),
  }),

  // ============ AI ASSISTANT ============
  ai: router({
    askAboutQuote: protectedProcedure
      .input(z.object({
        quoteId: z.number(),
        promptType: z.enum([
          "missed",
          "risks",
          "assumptions",
          "pricing",
          "issues",
          "custom"
        ]),
        customPrompt: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        // Get quote data
        const quote = await getQuoteById(input.quoteId, ctx.user.id);
        if (!quote) throw new Error("Quote not found");

        const lineItems = await getLineItemsByQuoteId(input.quoteId);
        const tenderContext = await getTenderContextByQuoteId(input.quoteId);
        const internalEstimate = await getInternalEstimateByQuoteId(input.quoteId);

        // Build context about the quote
        const lineItemsText = lineItems.length > 0
          ? lineItems.map(item => 
              `- ${item.description}: ${item.quantity} ${item.unit} @ £${item.rate} = £${item.total}`
            ).join("\n")
          : "No line items added yet";

        const quoteContext = `
## Quote Details
- **Title**: ${quote.title || "Untitled Quote"}
- **Client**: ${quote.clientName || "Not specified"}
- **Client Email**: ${quote.clientEmail || "Not specified"}
- **Client Address**: ${quote.clientAddress || "Not specified"}
- **Description**: ${quote.description || "No description"}
- **Status**: ${quote.status}

## Line Items
${lineItemsText}

## Financials
- **Subtotal**: £${quote.subtotal || "0.00"}
- **Tax Rate**: ${quote.taxRate || "0"}%
- **Tax Amount**: £${quote.taxAmount || "0.00"}
- **Total**: £${quote.total || "0.00"}

## Terms & Conditions
${quote.terms || "No terms specified"}

${tenderContext ? `## Tender Context
- **Assumptions**: ${tenderContext.assumptions ? tenderContext.assumptions.map((a: { text: string }) => a.text).join(", ") : "None listed"}
- **Exclusions**: ${tenderContext.exclusions ? tenderContext.exclusions.map((e: { text: string }) => e.text).join(", ") : "None listed"}
- **Notes**: ${tenderContext.notes || "None"}` : ""}

${internalEstimate ? `## Internal Estimate Notes
- **Notes**: ${internalEstimate.notes || "None"}
- **Risk Notes**: ${internalEstimate.riskNotes || "None"}` : ""}
`.trim();

        // Define prompts for each type
        const prompts: Record<string, string> = {
          missed: "Based on this quote, what items, services, or considerations might I have missed? Think about common oversights in similar projects.",
          risks: "What risks should I consider for this quote? Think about project risks, delivery risks, scope creep, and client-related risks.",
          assumptions: "What assumptions am I making in this quote that I should explicitly state to the client? What should be clarified before proceeding?",
          pricing: "Does this quote look appropriately priced? Consider the scope, market rates, and value delivered. Flag if anything seems under-priced or over-priced.",
          issues: "What usually causes issues on jobs like this? What are common problems, delays, or disputes that arise in similar projects?",
          custom: input.customPrompt || "Please review this quote and provide your analysis.",
        };

        const userPrompt = prompts[input.promptType];

        const systemPrompt = `You are an experienced business consultant and estimator helping review quotes for a professional services business. 

You provide practical, actionable advice based on real-world experience. Your responses should be:
- Specific and relevant to the quote details provided
- Practical and actionable
- Professional but conversational
- Focused on helping the user create better, more complete quotes

Do NOT use generic advice. Base your response on the specific quote details provided.
Keep responses concise but thorough - aim for 3-5 key points.
Use bullet points for clarity.
Do not start with phrases like "Based on the quote..." - get straight to the insights.`;

        try {
          const response = await invokeLLM({
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: `Here is the quote I'm working on:\n\n${quoteContext}\n\n${userPrompt}` },
            ],
          });

          const content = response.choices[0]?.message?.content;
          const responseText = typeof content === "string" 
            ? content 
            : Array.isArray(content) 
              ? content.map(c => c.type === "text" ? c.text : "").join("")
              : "Unable to generate response";

          // Log usage for billing
          const org = await getUserPrimaryOrg(ctx.user.id);
          if (org) {
            await logUsage({
              orgId: org.id,
              userId: ctx.user.id,
              actionType: "ask_ai",
              creditsUsed: 1,
              metadata: { quoteId: input.quoteId, promptType: input.promptType },
            });
          }

          return {
            success: true,
            response: responseText,
            promptType: input.promptType,
          };
        } catch (error) {
          console.error("AI invocation error:", error);
          throw new Error("Failed to get AI response. Please try again.");
        }
      }),

    // Generate a draft quote from all processed inputs
    generateDraft: protectedProcedure
      .input(z.object({
        quoteId: z.number(),
        userPrompt: z.string().optional(), // Additional context from user (pasted email, instructions)
      }))
      .mutation(async ({ ctx, input }) => {
        const quote = await getQuoteById(input.quoteId, ctx.user.id);
        if (!quote) throw new Error("Quote not found");

        // Get all inputs for this quote
        const inputs = await getInputsByQuoteId(input.quoteId);
        const tenderContext = await getTenderContextByQuoteId(input.quoteId);
        const internalEstimate = await getInternalEstimateByQuoteId(input.quoteId);
        const catalogItems = await getCatalogItemsByUserId(ctx.user.id);

        // Build context from all processed inputs
        const processedEvidence: string[] = [];
        
        for (const inp of inputs) {
          if (inp.processedContent && inp.processingStatus === "completed") {
            const typeLabel = inp.inputType === "audio" ? "Audio Transcription"
              : inp.inputType === "pdf" ? "PDF Content"
              : inp.inputType === "image" ? "Image Analysis"
              : inp.inputType === "email" ? "Email Content"
              : "Text Note";
            processedEvidence.push(`### ${typeLabel} (${inp.filename || "untitled"}):\n${inp.processedContent}`);
          } else if (inp.inputType === "text" && inp.content) {
            processedEvidence.push(`### Text Note:\n${inp.content}`);
          } else if (inp.inputType === "email" && inp.content) {
            processedEvidence.push(`### Email Content:\n${inp.content}`);
          }
        }

        // Add user prompt if provided (this is valid evidence on its own)
        if (input.userPrompt && input.userPrompt.trim()) {
          processedEvidence.push(`### User Instructions/Email:\n${input.userPrompt}`);
        }

        if (processedEvidence.length === 0) {
          throw new Error("No evidence found. Please add text in the 'Email/Instructions for AI' field, or upload and process files (transcribe audio, extract PDF text, analyze images).");
        }

        // Build catalog context
        const catalogContext = catalogItems.length > 0
          ? `\n\nAvailable catalog items for reference:\n${catalogItems.map(c => `- ${c.name}: £${c.defaultRate}/${c.unit} - ${c.description || ""}`).join("\n")}`
          : "";

        // Generate draft using LLM
        const response = await invokeLLM({
          messages: [
            {
              role: "system",
              content: `You are an expert estimator/quoting assistant. Based on the provided evidence (transcriptions, documents, images, emails), generate a structured quote draft.

You MUST respond with valid JSON in this exact format:
{
  "clientName": "string or null",
  "clientEmail": "string or null",
  "clientPhone": "string or null",
  "clientAddress": "string or null",
  "title": "string - brief title for the work",
  "description": "string - detailed description of scope",
  "lineItems": [
    {
      "description": "string",
      "quantity": number,
      "unit": "string (each, sqm, hours, etc.)",
      "rate": number
    }
  ],
  "assumptions": ["string array of assumptions made"],
  "exclusions": ["string array of what is NOT included"],
  "riskNotes": "string - internal notes about risks or concerns",
  "symbolMappings": { "symbol": { "meaning": "string", "confirmed": false } }
}

Be thorough but realistic with pricing. Extract all client details mentioned. List specific line items with quantities. Note any assumptions you're making and things that are explicitly excluded.${catalogContext}`,
            },
            {
              role: "user",
              content: `Please analyze the following evidence and generate a quote draft:\n\n${processedEvidence.join("\n\n")}`,
            },
          ],
          response_format: { type: "json_object" },
        });

        const content = response.choices[0]?.message?.content;
        const responseText = typeof content === "string" ? content : "";

        try {
          const draft = JSON.parse(responseText);

          // Update quote with extracted client details and description
          const updatedQuote = await updateQuote(input.quoteId, ctx.user.id, {
            clientName: draft.clientName || quote.clientName,
            clientEmail: draft.clientEmail || quote.clientEmail,
            clientPhone: draft.clientPhone || quote.clientPhone,
            clientAddress: draft.clientAddress || quote.clientAddress,
            title: draft.title || quote.title,
            description: draft.description || quote.description,
          });

          // Create line items
          const createdLineItems = [];
          if (draft.lineItems && Array.isArray(draft.lineItems)) {
            for (let i = 0; i < draft.lineItems.length; i++) {
              const item = draft.lineItems[i];
              const quantity = parseFloat(item.quantity) || 1;
              const rate = parseFloat(item.rate) || 0;
              const total = quantity * rate;
              
              const lineItem = await createLineItem({
                quoteId: input.quoteId,
                sortOrder: i,
                description: item.description,
                quantity: quantity.toFixed(4),
                unit: item.unit || "each",
                rate: rate.toFixed(2),
                total: total.toFixed(2),
              });
              createdLineItems.push(lineItem);
            }
          }

          // Update tender context with assumptions/exclusions
          if (draft.assumptions || draft.exclusions || draft.symbolMappings) {
            await upsertTenderContext(input.quoteId, {
              assumptions: draft.assumptions?.map((text: string) => ({ text, confirmed: false })),
              exclusions: draft.exclusions?.map((text: string) => ({ text, confirmed: false })),
              symbolMappings: draft.symbolMappings,
            });
          }

          // Update internal estimate with risk notes
          if (draft.riskNotes) {
            await upsertInternalEstimate(input.quoteId, {
              riskNotes: draft.riskNotes,
            });
          }

          // Recalculate totals
          await recalculateQuoteTotals(input.quoteId, ctx.user.id);

          // Log usage for billing
          const org = await getUserPrimaryOrg(ctx.user.id);
          if (org) {
            await logUsage({
              orgId: org.id,
              userId: ctx.user.id,
              actionType: "generate_draft",
              creditsUsed: 5, // Draft generation uses more credits
              metadata: { quoteId: input.quoteId, lineItemsGenerated: createdLineItems.length },
            });
          }

          return {
            success: true,
            quote: updatedQuote,
            lineItems: createdLineItems,
            draft,
          };
        } catch (parseError) {
          console.error("Failed to parse AI response:", parseError);
          throw new Error("Failed to parse AI response. Please try again.");
        }
      }),
  }),
});

export type AppRouter = typeof appRouter;
