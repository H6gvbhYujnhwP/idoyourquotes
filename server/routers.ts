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
  getQuoteById,
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
  getTenderContextByQuoteId,
  upsertTenderContext,
  getInternalEstimateByQuoteId,
  upsertInternalEstimate,
  getCatalogItemsByUserId,
  createCatalogItem,
  updateCatalogItem,
  deleteCatalogItem,
  recalculateQuoteTotals,
  updateUserProfile,
  changePassword,
} from "./db";

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
      return getQuotesByUserId(ctx.user.id);
    }),

    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
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
        return createQuote({
          userId: ctx.user.id,
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

        // Upload to R2
        const folder = `quotes/${input.quoteId}`;
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
        return createCatalogItem({
          userId: ctx.user.id,
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
  }),
});

export type AppRouter = typeof appRouter;
