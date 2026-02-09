import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { invokeLLM } from "./_core/llm";
import { uploadToR2, getPresignedUrl, deleteFromR2, isR2Configured, getFileBuffer } from "./r2Storage";
import { analyzePdfWithClaude, analyzeImageWithClaude, isClaudeConfigured } from "./_core/claude";
import { extractUrls, scrapeUrls, formatScrapedContentForAI } from "./_core/webScraper";
import { extractBrandColors } from "./services/colorExtractor";
import { parseWordDocument, isWordDocument } from "./services/wordParser";
import { parseSpreadsheet, isSpreadsheet, formatSpreadsheetForAI } from "./services/excelParser";
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
  duplicateQuote,
  getLineItemsByQuoteId,
  createLineItem,
  updateLineItem,
  deleteLineItem,
  deleteLineItemsByQuoteId,
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
  updateOrganization,
  logUsage,
} from "./db";
import { transcribeAudio } from "./_core/voiceTranscription";
import { TRADE_PRESETS, TradePresetKey } from "./tradePresets";
import type { ComprehensiveConfig } from "../drizzle/schema";

/**
 * Helper function to get a quote with org-first access pattern.
 * Tries org-based access first, then falls back to user-based access for legacy data.
 */
async function getQuoteWithOrgAccess(quoteId: number, userId: number): Promise<Awaited<ReturnType<typeof getQuoteById>> | null> {
  const org = await getUserPrimaryOrg(userId);
  if (org) {
    const quote = await getQuoteByIdAndOrg(quoteId, org.id);
    if (quote) return quote;
  }
  // Fallback to user-based access for legacy data
  return getQuoteById(quoteId, userId);
}

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

        // Extract brand colors from logo
        console.log('[uploadLogo] Extracting brand colors from logo...');
        const brandColors = await extractBrandColors(buffer);
        console.log('[uploadLogo] Extracted colors:', brandColors);

        // Update user profile with logo URL
        const user = await updateUserProfile(ctx.user.id, { companyLogo: url });

        // Update organization with logo URL and brand colors
        const org = await getUserPrimaryOrg(ctx.user.id);
        if (org) {
          await updateOrganization(org.id, {
            companyLogo: url,
            brandPrimaryColor: brandColors.primaryColor,
            brandSecondaryColor: brandColors.secondaryColor,
          });
          console.log('[uploadLogo] Updated org', org.id, 'with brand colors');
        }

        return { url, key, user, brandColors };
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
        quoteMode: z.enum(["simple", "comprehensive"]).optional(),
        tradePreset: z.string().optional(),
      }).optional())
      .mutation(async ({ ctx, input }) => {
        // Get user's organization to set orgId
        const org = await getUserPrimaryOrg(ctx.user.id);
        
        // Auto-populate T&C from user's default if not provided
        const terms = input?.terms || ctx.user.defaultTerms || undefined;
        
        // Build comprehensive config if mode is comprehensive
        let comprehensiveConfig: ComprehensiveConfig | undefined;
        const quoteMode = input?.quoteMode || "simple";
        const tradePreset = input?.tradePreset;
        
        if (quoteMode === "comprehensive" && tradePreset && tradePreset in TRADE_PRESETS) {
          const preset = TRADE_PRESETS[tradePreset as TradePresetKey];
          comprehensiveConfig = {
            sections: {
              coverLetter: { enabled: preset.sections.coverLetter.enabled },
              tradeBill: { enabled: preset.sections.tradeBill.enabled, format: preset.sections.tradeBill.format },
              reviewForms: { enabled: preset.sections.reviewForms.enabled, templates: [...(preset.sections.reviewForms.templates || [])] },
              technicalReview: { enabled: preset.sections.technicalReview.enabled, checklist: (preset.sections.technicalReview as { checklist?: string[] }).checklist },
              drawings: { enabled: preset.sections.drawings.enabled, categories: (preset.sections.drawings as { categories?: string[] }).categories },
              supportingDocs: { enabled: preset.sections.supportingDocs.enabled, categories: (preset.sections.supportingDocs as { categories?: string[] }).categories },
              siteRequirements: { enabled: preset.sections.siteRequirements.enabled },
              qualityCompliance: { enabled: preset.sections.qualityCompliance.enabled },
            },
            timeline: preset.timeline.enabled ? { enabled: true, phases: [] } : undefined,
          };
        }
        
        const quote = await createQuote({
          userId: ctx.user.id,
          orgId: org?.id,
          ...input,
          terms,
          quoteMode: quoteMode as "simple" | "comprehensive",
          tradePreset: tradePreset || undefined,
          comprehensiveConfig: comprehensiveConfig as any,
        });
        
        return quote;
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
        // Try org-based access first to verify ownership
        const org = await getUserPrimaryOrg(ctx.user.id);
        let existingQuote = null;
        if (org) {
          existingQuote = await getQuoteByIdAndOrg(id, org.id);
        }
        if (!existingQuote) {
          existingQuote = await getQuoteById(id, ctx.user.id);
        }
        if (!existingQuote) throw new Error("Quote not found");
        
        const quote = await updateQuote(id, ctx.user.id, data);
        if (!quote) throw new Error("Failed to update quote");
        
        // Recalculate totals if tax rate changed
        if (data.taxRate !== undefined) {
          return recalculateQuoteTotals(id, ctx.user.id);
        }
        return quote;
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        // Try org-based access first to verify ownership
        const org = await getUserPrimaryOrg(ctx.user.id);
        let existingQuote = null;
        if (org) {
          existingQuote = await getQuoteByIdAndOrg(input.id, org.id);
        }
        if (!existingQuote) {
          existingQuote = await getQuoteById(input.id, ctx.user.id);
        }
        if (!existingQuote) throw new Error("Quote not found");
        
        // Delete quote and get list of file keys to clean up
        const result = await deleteQuote(input.id, ctx.user.id);
        const deletedFiles = result?.deletedFiles || [];
        
        // Clean up files from R2 storage (don't block on failures)
        if (deletedFiles.length > 0) {
          console.log(`[deleteQuote] Cleaning up ${deletedFiles.length} files from R2 storage`);
          for (const fileKey of deletedFiles) {
            try {
              // Use deleteFromR2 which uses direct Cloudflare R2 API (works on Render)
              // storageDelete uses Manus built-in API which isn't available on Render
              await deleteFromR2(fileKey);
              console.log(`[deleteQuote] Deleted file from R2: ${fileKey}`);
            } catch (err) {
              console.error(`[deleteQuote] Failed to delete file ${fileKey}:`, err);
              // Continue with other files even if one fails
            }
          }
        }
        
        return { success: result?.success ?? true, deletedFilesCount: deletedFiles.length };
      }),

    // Duplicate a quote with all related data
    duplicate: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        // Try org-based access first to verify ownership
        const org = await getUserPrimaryOrg(ctx.user.id);
        let existingQuote = null;
        if (org) {
          existingQuote = await getQuoteByIdAndOrg(input.id, org.id);
        }
        if (!existingQuote) {
          existingQuote = await getQuoteById(input.id, ctx.user.id);
        }
        if (!existingQuote) throw new Error("Quote not found");

        // Duplicate the quote
        const newQuote = await duplicateQuote(input.id, ctx.user.id, org?.id);
        
        console.log(`[duplicateQuote] Created duplicate quote ${newQuote.id} (${newQuote.reference}) from original ${input.id}`);
        
        return newQuote;
      }),

    // ============ COMPREHENSIVE QUOTE ENDPOINTS ============

    // Get available trade presets
    getTradePresets: publicProcedure
      .query(() => {
        const categoryMap: Record<string, string> = {
          construction: "Construction & Engineering",
          electrical: "Construction & Engineering",
          metalwork: "Construction & Engineering",
          general_construction: "Construction & Engineering",
          roofing: "Construction & Engineering",
          scaffolding: "Construction & Engineering",
          plumbing: "Mechanical & Services",
          hvac: "Mechanical & Services",
          fire_protection: "Mechanical & Services",
          lifts_access: "Mechanical & Services",
          mechanical_fabrication: "Mechanical & Services",
          insulation_retrofit: "Mechanical & Services",
          bathrooms_kitchens: "Fit-Out & Finishing",
          windows_doors: "Fit-Out & Finishing",
          joinery: "Fit-Out & Finishing",
          painting: "Fit-Out & Finishing",
          building_maintenance: "Specialist Services",
          commercial_cleaning: "Specialist Services",
          pest_control: "Specialist Services",
          custom: "Other",
        };
        return Object.entries(TRADE_PRESETS).map(([key, preset]) => ({
          key,
          name: preset.name,
          description: preset.description,
          category: categoryMap[key] || "Other",
        }));
      }),

    // Update comprehensive config
    updateComprehensiveConfig: protectedProcedure
      .input(z.object({
        quoteId: z.number(),
        config: z.any(),
      }))
      .mutation(async ({ ctx, input }) => {
        const quote = await getQuoteWithOrgAccess(input.quoteId, ctx.user.id);
        if (!quote) throw new Error("Quote not found");
        
        return updateQuote(input.quoteId, ctx.user.id, {
          comprehensiveConfig: input.config,
        } as any);
      }),

    // AI: Suggest project timeline based on line items and trade preset
    suggestTimeline: protectedProcedure
      .input(z.object({ quoteId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const quote = await getQuoteWithOrgAccess(input.quoteId, ctx.user.id);
        if (!quote) throw new Error("Quote not found");
        if (quote.quoteMode !== "comprehensive") throw new Error("Quote is not in comprehensive mode");
        
        const lineItems = await getLineItemsByQuoteId(input.quoteId);
        const preset = quote.tradePreset ? TRADE_PRESETS[quote.tradePreset as TradePresetKey] : null;
        
        const lineItemsText = lineItems.length > 0
          ? lineItems.map(item => `- ${item.description}: ${item.quantity} ${item.unit} @ £${item.rate} = £${item.total}`).join("\n")
          : "No line items added yet";
        
        const timelinePrompt = preset?.aiPrompts?.timelineAnalysis || "Analyze the project scope and suggest a realistic timeline with phases.";
        
        const response = await invokeLLM({
          messages: [
            {
              role: "system",
              content: `You are a senior project planner with decades of trade experience. Given the quote details below, produce a realistic phased programme.

Trade-specific guidance:
${timelinePrompt}

Rules:
- Use plain, direct language. No filler phrases such as "I recommend" or "Based on my analysis".
- Every phase must have a concrete description of the work, not a vague summary.
- Durations must reflect real-world trade timelines, not optimistic estimates.
- Cost breakdowns must be plausible for the scope described.
- Risk factors should be specific and actionable, not generic.

Respond with valid JSON only:
{
  "estimatedDuration": { "value": 8, "unit": "weeks" },
  "phases": [
    {
      "id": "phase-1",
      "name": "Phase Name",
      "description": "Concrete description of work in this phase",
      "duration": { "value": 2, "unit": "weeks" },
      "resources": { "manpower": "2 workers", "equipment": ["crane"], "materials": ["steel"] },
      "costBreakdown": { "labour": 5000, "materials": 3000, "equipment": 1000, "total": 9000 },
      "riskFactors": ["Specific risk"],
      "dependencies": ["What must be completed before this phase"]
    }
  ]
}`,
            },
            {
              role: "user",
              content: `Quote: ${quote.title || "Untitled"}\nClient: ${quote.clientName || "Unknown"}\nDescription: ${quote.description || "None"}\nTotal: £${quote.total || "0.00"}\n\nLine Items:\n${lineItemsText}`,
            },
          ],
          response_format: { type: "json_object" },
        });
        
        const content = response.choices[0]?.message?.content;
        const responseText = typeof content === "string" ? content : "";
        
        try {
          const timeline = JSON.parse(responseText);
          
          // Update the comprehensive config with the timeline
          const config = (quote.comprehensiveConfig || {}) as ComprehensiveConfig;
          const updatedConfig: ComprehensiveConfig = {
            ...config,
            sections: config.sections || {} as ComprehensiveConfig["sections"],
            timeline: {
              enabled: true,
              estimatedDuration: timeline.estimatedDuration,
              phases: timeline.phases || [],
            },
          };
          
          await updateQuote(input.quoteId, ctx.user.id, {
            comprehensiveConfig: updatedConfig,
          } as any);
          
          // Log usage
          const org = await getUserPrimaryOrg(ctx.user.id);
          if (org) {
            await logUsage({
              orgId: org.id,
              userId: ctx.user.id,
              actionType: "suggest_timeline",
              creditsUsed: 3,
              metadata: { quoteId: input.quoteId },
            });
          }
          
          return timeline;
        } catch (parseError) {
          console.error("Failed to parse timeline response:", parseError);
          throw new Error("Failed to generate timeline. Please try again.");
        }
      }),

    // AI: Categorize an uploaded document
    categorizeDocument: protectedProcedure
      .input(z.object({
        quoteId: z.number(),
        inputId: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        const quote = await getQuoteWithOrgAccess(input.quoteId, ctx.user.id);
        if (!quote) throw new Error("Quote not found");
        if (quote.quoteMode !== "comprehensive") throw new Error("Quote is not in comprehensive mode");
        
        const inputRecord = await getInputById(input.inputId);
        if (!inputRecord) throw new Error("Input not found");
        
        const preset = quote.tradePreset ? TRADE_PRESETS[quote.tradePreset as TradePresetKey] : null;
        const categorizationPrompt = preset?.aiPrompts?.documentCategorization || "Categorize this document based on its content and purpose.";
        
        const docContent = inputRecord.processedContent || inputRecord.content || inputRecord.filename || "Unknown document";
        
        const response = await invokeLLM({
          messages: [
            {
              role: "system",
              content: `You are a document classifier for trade and construction tenders.\n\n${categorizationPrompt}\n\nRules:\n- Classify based on document content, not filename alone.\n- Use plain language in the reasoning field. No AI phrasing.\n- Confidence must reflect genuine certainty, not a default high value.\n\nRespond with valid JSON only:\n{\n  "category": "category_name",\n  "confidence": 0.95,\n  "reasoning": "One-sentence factual explanation of why this category was chosen"\n}`,
            },
            {
              role: "user",
              content: `Document filename: ${inputRecord.filename || "unknown"}\nDocument type: ${inputRecord.inputType}\n\nContent preview:\n${docContent.substring(0, 3000)}`,
            },
          ],
          response_format: { type: "json_object" },
        });
        
        const content = response.choices[0]?.message?.content;
        const responseText = typeof content === "string" ? content : "";
        
        try {
          const result = JSON.parse(responseText);
          
          // Update comprehensive config with categorized file
          const config = (quote.comprehensiveConfig || {}) as ComprehensiveConfig;
          const category = result.category;
          
          // Add to drawings or supporting docs based on category
          if (config.sections?.drawings?.categories?.includes(category)) {
            if (!config.sections.drawings.filesByCategory) config.sections.drawings.filesByCategory = {};
            if (!config.sections.drawings.filesByCategory[category]) config.sections.drawings.filesByCategory[category] = [];
            config.sections.drawings.filesByCategory[category].push(input.inputId);
          } else if (config.sections?.supportingDocs?.categories?.includes(category)) {
            if (!config.sections.supportingDocs.filesByCategory) config.sections.supportingDocs.filesByCategory = {};
            if (!config.sections.supportingDocs.filesByCategory[category]) config.sections.supportingDocs.filesByCategory[category] = [];
            config.sections.supportingDocs.filesByCategory[category].push(input.inputId);
          }
          
          await updateQuote(input.quoteId, ctx.user.id, {
            comprehensiveConfig: config,
          } as any);
          
          // Log usage
          const org = await getUserPrimaryOrg(ctx.user.id);
          if (org) {
            await logUsage({
              orgId: org.id,
              userId: ctx.user.id,
              actionType: "categorize_document",
              creditsUsed: 1,
              metadata: { quoteId: input.quoteId, inputId: input.inputId, category },
            });
          }
          
          return result;
        } catch (parseError) {
          console.error("Failed to parse categorization response:", parseError);
          throw new Error("Failed to categorize document. Please try again.");
        }
      }),

    // AI: Populate review forms from tender documents
    populateReviewForms: protectedProcedure
      .input(z.object({ quoteId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const quote = await getQuoteWithOrgAccess(input.quoteId, ctx.user.id);
        if (!quote) throw new Error("Quote not found");
        if (quote.quoteMode !== "comprehensive") throw new Error("Quote is not in comprehensive mode");
        
        const inputs = await getInputsByQuoteId(input.quoteId);
        const lineItems = await getLineItemsByQuoteId(input.quoteId);
        
        // Build context from all processed inputs
        const processedContent = inputs
          .filter(inp => inp.processedContent)
          .map(inp => `[${inp.filename || inp.inputType}]:\n${inp.processedContent}`)
          .join("\n\n---\n\n");
        
        const lineItemsText = lineItems.map(item => 
          `- ${item.description}: ${item.quantity} ${item.unit} @ £${item.rate}`
        ).join("\n");
        
        const response = await invokeLLM({
          messages: [
            {
              role: "system",
              content: `You are a tender review specialist extracting structured data from trade documents.

Rules:
- Extract only what is explicitly stated in the documents. Do not invent requirements.
- Use plain, factual language. No phrases like "I've identified" or "Based on my review".
- If a field cannot be determined from the documents, omit it or use an empty array.
- Standards and certifications must use their official names (e.g. "BS EN 1090-2", not paraphrased versions).

Respond with valid JSON:
{
  "technicalReview": {
    "materialTypes": [{ "item": "name", "specification": "spec", "grade": "grade", "quantity": "qty" }],
    "specialRequirements": ["requirement"],
    "inspectionRequirements": ["requirement"]
  },
  "siteRequirements": {
    "workingHours": { "start": "08:00", "end": "16:30", "days": "Monday to Friday" },
    "accessRestrictions": ["restriction"],
    "safetyRequirements": ["requirement"]
  },
  "qualityCompliance": {
    "requiredStandards": ["standard"],
    "certifications": [{ "name": "cert", "required": true }],
    "inspectionPoints": [{ "phase": "phase", "description": "desc" }]
  }
}`,
            },
            {
              role: "user",
              content: `Quote: ${quote.title || "Untitled"}\nClient: ${quote.clientName || "Unknown"}\n\nLine Items:\n${lineItemsText}\n\nTender Documents:\n${processedContent.substring(0, 8000)}`,
            },
          ],
          response_format: { type: "json_object" },
        });
        
        const content = response.choices[0]?.message?.content;
        const responseText = typeof content === "string" ? content : "";
        
        try {
          const formData = JSON.parse(responseText);
          
          // Update comprehensive config with form data
          const config = (quote.comprehensiveConfig || {}) as ComprehensiveConfig;
          
          if (config.sections?.technicalReview?.enabled && formData.technicalReview) {
            config.sections.technicalReview.data = formData.technicalReview;
          }
          if (config.sections?.siteRequirements?.enabled && formData.siteRequirements) {
            config.sections.siteRequirements.data = formData.siteRequirements;
          }
          if (config.sections?.qualityCompliance?.enabled && formData.qualityCompliance) {
            config.sections.qualityCompliance.data = formData.qualityCompliance;
          }
          
          await updateQuote(input.quoteId, ctx.user.id, {
            comprehensiveConfig: config,
          } as any);
          
          // Log usage
          const org = await getUserPrimaryOrg(ctx.user.id);
          if (org) {
            await logUsage({
              orgId: org.id,
              userId: ctx.user.id,
              actionType: "populate_review_forms",
              creditsUsed: 4,
              metadata: { quoteId: input.quoteId },
            });
          }
          
          return formData;
        } catch (parseError) {
          console.error("Failed to parse review forms response:", parseError);
          throw new Error("Failed to populate review forms. Please try again.");
        }
      }),

    // Update quote status with validation
    updateStatus: protectedProcedure
      .input(z.object({
        id: z.number(),
        status: z.enum(["draft", "sent", "accepted", "declined"]),
      }))
      .mutation(async ({ ctx, input }) => {
        // Try org-based access first
        const org = await getUserPrimaryOrg(ctx.user.id);
        let currentQuote = null;
        if (org) {
          currentQuote = await getQuoteByIdAndOrg(input.id, org.id);
        }
        if (!currentQuote) {
          currentQuote = await getQuoteById(input.id, ctx.user.id);
        }
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
        console.log(`[getFull] Starting for quoteId=${input.id}, userId=${ctx.user.id}`);
        
        try {
          // Try org-based access first
          console.log(`[getFull] Looking up user's primary org...`);
          const org = await getUserPrimaryOrg(ctx.user.id);
          console.log(`[getFull] Org lookup result:`, org ? `orgId=${org.id}, name=${org.name}` : 'no org found');
          
          let quote = null;
          if (org) {
            console.log(`[getFull] Trying org-based access with orgId=${org.id}...`);
            quote = await getQuoteByIdAndOrg(input.id, org.id);
            console.log(`[getFull] Org-based quote lookup:`, quote ? `found quote ${quote.id}` : 'not found');
          }
          
          // Fallback to user-based access for legacy data
          if (!quote) {
            console.log(`[getFull] Falling back to user-based access with userId=${ctx.user.id}...`);
            quote = await getQuoteById(input.id, ctx.user.id);
            console.log(`[getFull] User-based quote lookup:`, quote ? `found quote ${quote.id}` : 'not found');
          }
          
          if (!quote) {
            console.log(`[getFull] ERROR: Quote not found for id=${input.id}`);
            throw new Error("Quote not found");
          }
          
          console.log(`[getFull] Quote found, fetching related data...`);
          
          // Fetch related data with individual error handling
          let lineItems: Awaited<ReturnType<typeof getLineItemsByQuoteId>> = [];
          let inputs: Awaited<ReturnType<typeof getInputsByQuoteId>> = [];
          let tenderContext: Awaited<ReturnType<typeof getTenderContextByQuoteId>> = undefined;
          let internalEstimate: Awaited<ReturnType<typeof getInternalEstimateByQuoteId>> = undefined;
          
          try {
            console.log(`[getFull] Fetching line items...`);
            lineItems = await getLineItemsByQuoteId(input.id);
            console.log(`[getFull] Line items: ${lineItems?.length || 0} found`);
          } catch (err) {
            console.error(`[getFull] ERROR fetching line items:`, err);
            lineItems = [];
          }
          
          try {
            console.log(`[getFull] Fetching inputs...`);
            inputs = await getInputsByQuoteId(input.id);
            console.log(`[getFull] Inputs: ${inputs?.length || 0} found`);
          } catch (err) {
            console.error(`[getFull] ERROR fetching inputs:`, err);
            inputs = [];
          }
          
          try {
            console.log(`[getFull] Fetching tender context...`);
            tenderContext = await getTenderContextByQuoteId(input.id);
            console.log(`[getFull] Tender context:`, tenderContext ? 'found' : 'not found');
          } catch (err) {
            console.error(`[getFull] ERROR fetching tender context:`, err);
            tenderContext = undefined;
          }
          
          try {
            console.log(`[getFull] Fetching internal estimate...`);
            internalEstimate = await getInternalEstimateByQuoteId(input.id);
            console.log(`[getFull] Internal estimate:`, internalEstimate ? 'found' : 'not found');
          } catch (err) {
            console.error(`[getFull] ERROR fetching internal estimate:`, err);
            internalEstimate = undefined;
          }
          
          console.log(`[getFull] SUCCESS: Returning full quote data`);
          return {
            quote,
            lineItems: lineItems || [],
            inputs: inputs || [],
            tenderContext,
            internalEstimate,
          };
        } catch (error) {
          console.error(`[getFull] FATAL ERROR:`, error);
          throw error;
        }
      }),

    // Generate PDF HTML for a quote
    generatePDF: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        console.log("[generatePDF] Starting for quoteId:", input.id, "userId:", ctx.user.id);
        try {
          // Try org-based access first
          const org = await getUserPrimaryOrg(ctx.user.id);
          let quote = null;
          if (org) {
            console.log("[generatePDF] Trying org-based access, orgId:", org.id);
            quote = await getQuoteByIdAndOrg(input.id, org.id);
          }
          if (!quote) {
            console.log("[generatePDF] Trying user-based access");
            quote = await getQuoteById(input.id, ctx.user.id);
          }
          if (!quote) {
            console.log("[generatePDF] Quote not found");
            throw new Error("Quote not found");
          }
          console.log("[generatePDF] Quote found:", quote.id, quote.title);

          const lineItems = await getLineItemsByQuoteId(input.id);
          console.log("[generatePDF] Line items:", lineItems.length);
          
          const user = ctx.user;
          console.log("[generatePDF] Generating HTML...");
          console.log("[generatePDF] Org brand colors:", org?.brandPrimaryColor, org?.brandSecondaryColor);

          const html = generateQuoteHTML({ quote, lineItems, user, organization: org });
          console.log("[generatePDF] HTML generated, length:", html.length);
          
          return { html };
        } catch (error) {
          console.error("[generatePDF] Error:", error);
          throw error;
        }
      }),

    // Generate email draft for a quote
    generateEmail: protectedProcedure
      .input(z.object({
        id: z.number(),
        tone: z.enum(["neutral", "formal", "friendly"]).optional().default("neutral"),
        includeSummary: z.boolean().optional().default(true),
      }))
      .mutation(async ({ ctx, input }) => {
        // Try org-based access first
        const org = await getUserPrimaryOrg(ctx.user.id);
        let quote = null;
        if (org) {
          quote = await getQuoteByIdAndOrg(input.id, org.id);
        }
        if (!quote) {
          quote = await getQuoteById(input.id, ctx.user.id);
        }
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
        // Verify quote ownership with org-first access
        const quote = await getQuoteWithOrgAccess(input.quoteId, ctx.user.id);
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
        // Verify quote ownership with org-first access
        const quote = await getQuoteWithOrgAccess(input.quoteId, ctx.user.id);
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
        // Verify quote ownership with org-first access
        const quote = await getQuoteWithOrgAccess(input.quoteId, ctx.user.id);
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
        // Verify quote ownership with org-first access
        const quote = await getQuoteWithOrgAccess(input.quoteId, ctx.user.id);
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
        const quote = await getQuoteWithOrgAccess(input.quoteId, ctx.user.id);
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
        const quote = await getQuoteWithOrgAccess(input.quoteId, ctx.user.id);
        if (!quote) throw new Error("Quote not found");

        return createInput(input);
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number(), quoteId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const quote = await getQuoteWithOrgAccess(input.quoteId, ctx.user.id);
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
        inputType: z.enum(["pdf", "image", "audio", "email", "document"]),
      }))
      .mutation(async ({ ctx, input }) => {
        const quote = await getQuoteWithOrgAccess(input.quoteId, ctx.user.id);
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

        // Auto-analyze the uploaded file in the background
        // Don't await - let it process asynchronously
        if (input.inputType === "pdf" || input.inputType === "image" || input.inputType === "audio" || input.inputType === "document") {
          (async () => {
            try {
              // Mark as processing
              await updateInputProcessing(inputRecord.id, {
                processingStatus: "processing",
                processingError: null,
              });

              let processedContent = "";

              if (input.inputType === "pdf") {
                // Check if Claude API is configured
                if (!isClaudeConfigured()) {
                  throw new Error("ANTHROPIC_API_KEY is not configured. Claude API is required for PDF analysis.");
                }

                // Download PDF from R2 storage and analyze with Claude
                const pdfBuffer = await getFileBuffer(key);
                
                processedContent = await analyzePdfWithClaude(
                  pdfBuffer,
                  `Analyze this document for quoting/estimation purposes. This could be a technical drawing, floor plan, specification sheet, architectural plan, or project documentation.

Extract and report:
1. **Document Overview**: What type of document is this? What project does it relate to?
2. **Text Content**: All visible text, labels, annotations, and notes
3. **Measurements & Dimensions**: All dimensions, areas, quantities, and measurements shown
4. **Technical Specifications**: Materials, equipment, standards, or specifications mentioned
5. **Layout & Structure**: Room layouts, floor plans, cable routes, equipment positions if applicable
6. **Symbols & Legends**: Any symbols, abbreviations, or legend items with their meanings
7. **Key Details for Quoting**: Quantities, scope of work, deliverables, or requirements
8. **Notes & Warnings**: Any special instructions, warnings, or conditions

Be thorough and precise - missed details in technical drawings often lead to costly errors in quotes. Include all numbers, dates, and technical details exactly as they appear.`,
                  "You are a document extraction tool for trade and construction tenders. Extract all text, measurements, specifications, and quantities exactly as they appear. Report facts only. Do not summarise, interpret, or add commentary. Use the document's own terminology."
                );
              } else if (input.inputType === "image") {
                // Check if Claude API is configured
                if (!isClaudeConfigured()) {
                  throw new Error("ANTHROPIC_API_KEY is not configured. Claude API is required for image analysis.");
                }

                // Download image from R2 storage and analyze with Claude
                const imageBuffer = await getFileBuffer(key);
                
                // Determine the image MIME type
                let imageMimeType: "image/jpeg" | "image/png" | "image/gif" | "image/webp" = "image/jpeg";
                if (input.contentType === "image/png") {
                  imageMimeType = "image/png";
                } else if (input.contentType === "image/gif") {
                  imageMimeType = "image/gif";
                } else if (input.contentType === "image/webp") {
                  imageMimeType = "image/webp";
                }

                processedContent = await analyzeImageWithClaude(
                  imageBuffer,
                  imageMimeType,
                  `Analyze this image for quoting/estimation purposes. This could be a technical drawing, floor plan, specification sheet, site photo, or architectural plan.

Extract and report:
1. **Image Overview**: What type of image is this? What does it show?
2. **Text Content**: Any visible text, labels, dimensions, measurements, specifications
3. **Symbols & Legends**: Any symbols, abbreviations, or legend items with their meanings
4. **Key Details**: Important features, quantities, materials, or specifications visible
5. **Measurements**: All dimensions, areas, quantities shown
6. **Layout Information**: Room layouts, equipment positions, cable routes if applicable
7. **Notes & Warnings**: Any notes, warnings, or special instructions

Be thorough - missed details in drawings often lead to costly errors in quotes.`,
                  "You are an image extraction tool for trade and construction tenders. Extract all visible text, dimensions, symbols, and details exactly as shown. Report facts only. Do not summarise, interpret, or add commentary. Use the drawing's own labels and terminology."
                );
              } else if (input.inputType === "audio") {
                // Transcribe audio
                const result = await transcribeAudio({
                  audioUrl: url,
                });
                if ("error" in result) {
                  throw new Error(result.error);
                }
                processedContent = result.text || "";
              } else if (input.inputType === "document") {
                // Handle Word and Excel documents
                const docBuffer = await getFileBuffer(key);
                
                if (isWordDocument(input.contentType, input.filename)) {
                  // Parse Word document
                  const wordResult = await parseWordDocument(docBuffer);
                  processedContent = `## Word Document Content\n\n${wordResult.text}`;
                  if (wordResult.messages.length > 0) {
                    console.log(`[Auto-analyze] Word parsing messages:`, wordResult.messages);
                  }
                } else if (isSpreadsheet(input.contentType, input.filename)) {
                  // Parse Excel/CSV spreadsheet
                  const spreadsheetResult = await parseSpreadsheet(docBuffer, input.filename);
                  processedContent = formatSpreadsheetForAI(spreadsheetResult);
                } else {
                  throw new Error(`Unsupported document type: ${input.contentType}`);
                }
              }

              // Save processed content
              await updateInputProcessing(inputRecord.id, {
                processedContent,
                processingStatus: "completed",
                processingError: null,
              });

              // Log usage for billing
              const userOrg = await getUserPrimaryOrg(ctx.user.id);
              if (userOrg) {
                const actionType = input.inputType === "pdf" ? "extract_pdf" 
                  : input.inputType === "image" ? "analyze_image" 
                  : input.inputType === "document" ? "parse_document"
                  : "transcribe_audio";
                const credits = input.inputType === "document" ? 1 : 2; // Documents are cheaper to parse
                await logUsage({
                  orgId: userOrg.id,
                  userId: ctx.user.id,
                  actionType,
                  creditsUsed: credits,
                  metadata: { quoteId: input.quoteId, inputId: inputRecord.id },
                });
              }

              console.log(`[Auto-analyze] Successfully processed ${input.inputType} input ${inputRecord.id}`);
            } catch (error) {
              console.error(`[Auto-analyze] Failed to process ${input.inputType} input ${inputRecord.id}:`, error);
              await updateInputProcessing(inputRecord.id, {
                processingStatus: "failed",
                processingError: error instanceof Error ? error.message : "Unknown error",
              });
            }
          })();
        }

        return inputRecord;
      }),

    // Get fresh presigned URL for a file
    getFileUrl: protectedProcedure
      .input(z.object({ quoteId: z.number(), fileKey: z.string() }))
      .query(async ({ ctx, input }) => {
        const quote = await getQuoteWithOrgAccess(input.quoteId, ctx.user.id);
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
        const quote = await getQuoteWithOrgAccess(input.quoteId, ctx.user.id);
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
        const quote = await getQuoteWithOrgAccess(input.quoteId, ctx.user.id);
        if (!quote) throw new Error("Quote not found");

        const inputRecord = await getInputById(input.inputId);
        if (!inputRecord || inputRecord.quoteId !== input.quoteId) {
          throw new Error("Input not found");
        }

        if (inputRecord.inputType !== "pdf") {
          throw new Error("Input is not a PDF file");
        }

        if (!inputRecord.fileKey) {
          throw new Error("No file key for this input");
        }

        // Mark as processing
        await updateInputProcessing(input.inputId, {
          processingStatus: "processing",
          processingError: null,
        });

        try {
          // Check if Claude API is configured
          if (!isClaudeConfigured()) {
            throw new Error("ANTHROPIC_API_KEY is not configured. Claude API is required for PDF analysis.");
          }

          // Download PDF from R2 storage and analyze with Claude
          const pdfBuffer = await getFileBuffer(inputRecord.fileKey);
          
          const extractedText = await analyzePdfWithClaude(
            pdfBuffer,
            `Analyze this document for quoting/estimation purposes. This could be a technical drawing, floor plan, specification sheet, architectural plan, or project documentation.

Extract and report:
1. **Document Overview**: What type of document is this? What project does it relate to?
2. **Text Content**: All visible text, labels, annotations, and notes
3. **Measurements & Dimensions**: All dimensions, areas, quantities, and measurements shown
4. **Technical Specifications**: Materials, equipment, standards, or specifications mentioned
5. **Layout & Structure**: Room layouts, floor plans, cable routes, equipment positions if applicable
6. **Symbols & Legends**: Any symbols, abbreviations, or legend items with their meanings
7. **Key Details for Quoting**: Quantities, scope of work, deliverables, or requirements
8. **Notes & Warnings**: Any special instructions, warnings, or conditions

Be thorough and precise - missed details in technical drawings often lead to costly errors in quotes. Include all numbers, dates, and technical details exactly as they appear.`,
            "You are a document analyzer specializing in construction, engineering, IT infrastructure, and technical documents. Your role is to extract all relevant information from technical drawings, floor plans, specifications, and project documents to support accurate quote generation. Be meticulous about measurements, quantities, and specifications."
          );

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
        const quote = await getQuoteWithOrgAccess(input.quoteId, ctx.user.id);
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
                content: `Extract all information from this image for quoting purposes.

Report the following, using the image's own labels and terminology:
1. **Text Content**: All visible text, labels, dimensions, measurements, and specifications exactly as shown.
2. **Symbols & Legends**: All symbols, abbreviations, and legend items with their meanings.
3. **Key Details**: Features, quantities, materials, and specifications visible.
4. **Measurements**: All dimensions, areas, and quantities shown with their units.
5. **Notes & Warnings**: Any notes, warnings, or special instructions.

Report facts only. Do not interpret or add commentary.`,
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
                    text: "Extract all text, measurements, symbols, and details from this image.",
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
        const quote = await getQuoteWithOrgAccess(input.quoteId, ctx.user.id);
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
        const quote = await getQuoteWithOrgAccess(input.quoteId, ctx.user.id);
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
        const quote = await getQuoteWithOrgAccess(input.quoteId, ctx.user.id);
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
        const quote = await getQuoteWithOrgAccess(input.quoteId, ctx.user.id);
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
        // Get quote data with org-first access
        const quote = await getQuoteWithOrgAccess(input.quoteId, ctx.user.id);
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

        const systemPrompt = `You are a senior estimator reviewing a colleague's quote before it goes to the client.

Rules:
- Write as a tradesperson would speak: direct, practical, no waffle.
- Never use phrases like "I've analyzed", "Based on my review", "I recommend", or "It's worth noting".
- Get straight to the point. Lead with the most important observation.
- Every suggestion must reference a specific line item, rate, or detail from the quote.
- If something looks underpriced or overpriced, say so plainly with reasoning.
- Keep responses to 3-5 key points. No padding.
- Use bullet points for clarity.
- If the quote looks solid, say so briefly and move on.`;

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
        const quote = await getQuoteWithOrgAccess(input.quoteId, ctx.user.id);
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
          
          // Detect and scrape URLs from user prompt
          const urls = extractUrls(input.userPrompt);
          if (urls.length > 0) {
            try {
              const scrapedContent = await scrapeUrls(urls);
              const formattedWebContent = formatScrapedContentForAI(scrapedContent);
              if (formattedWebContent) {
                processedEvidence.push(`### Website Content (auto-scraped from URLs in instructions):\n${formattedWebContent}`);
              }
            } catch (error) {
              // Silently ignore scraping errors - the URLs are still in the user prompt
              console.error("URL scraping error:", error);
            }
          }
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
              content: `You are a senior estimator preparing a quote from tender evidence. Extract facts from the documents provided and produce a structured draft.

Rules:
- Extract client details, scope, and quantities directly from the evidence. Do not invent information.
- Descriptions must be factual and specific to the project. No generic filler.
- Line item descriptions should be clear enough for a tradesperson to price without further context.
- Rates must be realistic for the UK market. If unsure, use conservative estimates and flag in assumptions.
- The description field appears on the client-facing PDF, so write it professionally in plain English.

You MUST respond with valid JSON in this exact format:
{
  "clientName": "string or null",
  "clientEmail": "string or null",
  "clientPhone": "string or null",
  "clientAddress": "string or null",
  "title": "string - brief but descriptive title for the work (e.g., 'Website Redesign and Marketing Strategy for EDP Handles')",
  "description": "string - COMPREHENSIVE description (3-5 sentences minimum) that includes: 1) Project overview and scope, 2) Key deliverables being quoted, 3) Client objectives or goals mentioned, 4) Any phases or timeline if discussed. This appears on the quote PDF so make it professional and informative.",
  "lineItems": [
    {
      "description": "string - detailed description of the line item",
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

IMPORTANT for description field:
- Write 3-5 sentences in plain professional English. No bullet points.
- State what the project involves and what the client will receive.
- Reference specific deliverables extracted from the evidence.
- Do not use phrases like "This comprehensive quote covers" or "We are pleased to offer".
- Write as if a tradesperson is explaining the scope to the client directly.

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

          // Delete existing line items before creating new ones (prevents duplicates on regenerate)
          await deleteLineItemsByQuoteId(input.quoteId);

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
