import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { invokeLLM } from "./_core/llm";
import { subscriptionRouter } from "./services/subscriptionRouter";
import { canCreateQuote, getUpgradeSuggestion, TIER_CONFIG, type SubscriptionTier } from "./services/stripe";
import { uploadToR2, getPresignedUrl, deleteFromR2, isR2Configured, getFileBuffer } from "./r2Storage";
import { analyzePdfWithClaude, analyzePdfWithOpenAI, analyzeImageWithClaude, isClaudeConfigured } from "./_core/claude";
import { isOpenAIConfigured } from "./_core/openai";
import { extractUrls, scrapeUrls, formatScrapedContentForAI } from "./_core/webScraper";
import { extractBrandColors } from "./services/colorExtractor";
import { parseWordDocument, isWordDocument } from "./services/wordParser";
import { performElectricalTakeoff, applyUserAnswers, formatTakeoffForQuoteContext, SYMBOL_STYLES, SYMBOL_DESCRIPTIONS, extractWithPdfJs, extractPdfLineColours } from "./services/electricalTakeoff";
import { performContainmentTakeoff, calculateCableSummary, generateContainmentSvgOverlay, isContainmentDrawing, formatContainmentForQuoteContext, TRAY_SIZE_COLOURS } from "./services/containmentTakeoff";
import { generateSvgOverlay } from "./services/takeoffMarkup";
import { createElectricalTakeoff, getElectricalTakeoffsByQuoteId, getElectricalTakeoffById, getElectricalTakeoffByInputId, updateElectricalTakeoff } from "./db";
import { createContainmentTakeoff, getContainmentTakeoffsByQuoteId, getContainmentTakeoffById, getContainmentTakeoffByInputId, updateContainmentTakeoff } from "./db";
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
  updateInputContent,
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
import type { ComprehensiveConfig, InsertQuote } from "../drizzle/schema";

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
    orgProfile: protectedProcedure.query(async ({ ctx }) => {
      const org = await getUserPrimaryOrg(ctx.user.id);
      return org || null;
    }),
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
        defaultTradeSector: z.string().optional(),
        // Trade-specific company defaults (saved to organization)
        defaultWorkingHoursStart: z.string().optional(),
        defaultWorkingHoursEnd: z.string().optional(),
        defaultWorkingDays: z.string().optional(),
        defaultInsuranceLimits: z.object({
          employers: z.string().optional(),
          public: z.string().optional(),
          professional: z.string().optional(),
        }).optional(),
        defaultDayWorkRates: z.object({
          labourRate: z.number().optional(),
          materialMarkup: z.number().optional(),
          plantMarkup: z.number().optional(),
        }).optional(),
        defaultExclusions: z.string().optional(),
        defaultValidityDays: z.number().optional(),
        defaultSignatoryName: z.string().optional(),
        defaultSignatoryPosition: z.string().optional(),
        defaultSurfaceTreatment: z.string().optional(),
        defaultReturnVisitRate: z.string().optional(),
        defaultPaymentTerms: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        // Save basic profile fields to user table (legacy compatibility)
        const { 
          defaultWorkingHoursStart, defaultWorkingHoursEnd, defaultWorkingDays,
          defaultInsuranceLimits, defaultDayWorkRates, defaultExclusions,
          defaultValidityDays, defaultSignatoryName, defaultSignatoryPosition,
          defaultSurfaceTreatment, defaultReturnVisitRate, defaultPaymentTerms,
          ...userFields 
        } = input;

        const user = await updateUserProfile(ctx.user.id, userFields);

        // Save trade defaults to organization (the multi-tenant entity)
        const org = await getUserPrimaryOrg(ctx.user.id);
        if (org) {
          const orgUpdate: Record<string, unknown> = {};
          // Sync basic company info to org too
          if (input.companyName !== undefined) orgUpdate.companyName = input.companyName;
          if (input.companyAddress !== undefined) orgUpdate.companyAddress = input.companyAddress;
          if (input.companyPhone !== undefined) orgUpdate.companyPhone = input.companyPhone;
          if (input.companyEmail !== undefined) orgUpdate.companyEmail = input.companyEmail;
          if (input.defaultTerms !== undefined) orgUpdate.defaultTerms = input.defaultTerms;
          // Trade-specific defaults
          if (defaultWorkingHoursStart !== undefined) orgUpdate.defaultWorkingHoursStart = defaultWorkingHoursStart;
          if (defaultWorkingHoursEnd !== undefined) orgUpdate.defaultWorkingHoursEnd = defaultWorkingHoursEnd;
          if (defaultWorkingDays !== undefined) orgUpdate.defaultWorkingDays = defaultWorkingDays;
          if (defaultInsuranceLimits !== undefined) orgUpdate.defaultInsuranceLimits = defaultInsuranceLimits;
          if (defaultDayWorkRates !== undefined) orgUpdate.defaultDayWorkRates = defaultDayWorkRates;
          if (defaultExclusions !== undefined) orgUpdate.defaultExclusions = defaultExclusions;
          if (defaultValidityDays !== undefined) orgUpdate.defaultValidityDays = defaultValidityDays;
          if (defaultSignatoryName !== undefined) orgUpdate.defaultSignatoryName = defaultSignatoryName;
          if (defaultSignatoryPosition !== undefined) orgUpdate.defaultSignatoryPosition = defaultSignatoryPosition;
          if (defaultSurfaceTreatment !== undefined) orgUpdate.defaultSurfaceTreatment = defaultSurfaceTreatment;
          if (defaultReturnVisitRate !== undefined) orgUpdate.defaultReturnVisitRate = defaultReturnVisitRate;
          if (defaultPaymentTerms !== undefined) orgUpdate.defaultPaymentTerms = defaultPaymentTerms;

          if (Object.keys(orgUpdate).length > 0) {
            await updateOrganization(org.id, orgUpdate as any);
          }
        }

        return user;
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
        
        // ── Quota check: enforce monthly quote limit ──
        if (org) {
          const quotaCheck = canCreateQuote(org as any);
          if (!quotaCheck.allowed) {
            const tier = (org as any).subscriptionTier as SubscriptionTier || 'trial';
            const suggestion = getUpgradeSuggestion(tier, 'quotes');
            const upgradeMsg = suggestion
              ? ` Upgrade to ${suggestion.tierName} (£${suggestion.price}/month) for ${suggestion.newLimit}.`
              : '';
            throw new Error(`${quotaCheck.reason}${upgradeMsg}`);
          }
          // Reset count if needed
          if (quotaCheck.shouldResetCount) {
            await updateOrganization(org.id, { monthlyQuoteCount: 0, quoteCountResetAt: new Date() } as any);
          }
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

        // ── Increment monthly quote count ──
        if (org) {
          const currentCount = ((org as any).monthlyQuoteCount ?? 0) + 1;
          await updateOrganization(org.id, { monthlyQuoteCount: currentCount } as any);
        }
        
        return quote;
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        title: z.string().optional(),
        reference: z.string().optional(),
        status: z.enum(["draft", "sent", "accepted", "declined"]).optional(),
        clientName: z.string().optional(),
        contactName: z.string().optional(),
        clientEmail: z.string().optional(),
        clientPhone: z.string().optional(),
        clientAddress: z.string().optional(),
        description: z.string().optional(),
        terms: z.string().optional(),
        validUntil: z.date().optional(),
        taxRate: z.string().optional(),
        userPrompt: z.string().nullable().optional(),
        processingInstructions: z.string().nullable().optional(),
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
          it_services: "Technology & Communications",
          telecoms_cabling: "Technology & Communications",
          solar_ev: "Renewable Energy",
          groundworks: "Construction & Engineering",
          fire_security: "Mechanical & Services",
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

    // Update a specific section of comprehensive config without affecting others
    updateComprehensiveSection: protectedProcedure
      .input(z.object({
        quoteId: z.number(),
        section: z.enum(["timeline", "siteRequirements", "qualityCompliance", "technicalReview", "coverLetter"]),
        data: z.any(),
      }))
      .mutation(async ({ ctx, input }) => {
        const quote = await getQuoteWithOrgAccess(input.quoteId, ctx.user.id);
        if (!quote) throw new Error("Quote not found");

        const existingConfig = ((quote as any).comprehensiveConfig || {}) as ComprehensiveConfig;

        let updatedConfig: ComprehensiveConfig;

        switch (input.section) {
          case "timeline":
            updatedConfig = {
              ...existingConfig,
              timeline: input.data,
            };
            break;

          case "siteRequirements":
            updatedConfig = {
              ...existingConfig,
              sections: {
                ...existingConfig.sections,
                siteRequirements: {
                  ...existingConfig.sections?.siteRequirements,
                  enabled: true,
                  data: input.data,
                },
              },
            };
            break;

          case "qualityCompliance":
            updatedConfig = {
              ...existingConfig,
              sections: {
                ...existingConfig.sections,
                qualityCompliance: {
                  ...existingConfig.sections?.qualityCompliance,
                  enabled: true,
                  data: input.data,
                },
              },
            };
            break;

          case "technicalReview":
            updatedConfig = {
              ...existingConfig,
              sections: {
                ...existingConfig.sections,
                technicalReview: {
                  ...existingConfig.sections?.technicalReview,
                  enabled: true,
                  data: input.data,
                },
              },
            };
            break;

          case "coverLetter":
            updatedConfig = {
              ...existingConfig,
              sections: {
                ...existingConfig.sections,
                coverLetter: {
                  ...existingConfig.sections?.coverLetter,
                  enabled: true,
                  content: input.data,
                },
              },
            };
            break;

          default:
            throw new Error("Invalid section");
        }

        await updateQuote(input.quoteId, ctx.user.id, {
          comprehensiveConfig: updatedConfig as any,
        } as any);

        console.log(`[updateComprehensiveSection] Updated ${input.section} for quote ${input.quoteId}`);

        return { success: true };
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
          
          // Fetch tender context for assumptions/exclusions (for all quote types)
          let tenderContext = null;
          try {
            tenderContext = await getTenderContextByQuoteId(input.id);
            console.log("[generatePDF] Tender context:", tenderContext ? 'found' : 'not found');
          } catch (e) {
            console.log("[generatePDF] Tender context fetch failed, continuing without");
          }

          const user = ctx.user;
          console.log("[generatePDF] Generating HTML...");
          console.log("[generatePDF] Org brand colors:", org?.brandPrimaryColor, org?.brandSecondaryColor);

          const html = generateQuoteHTML({ quote, lineItems, user, organization: org, tenderContext });
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
        const contactNameForEmail = (quote as any).contactName || clientName;
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

Client/Company: ${clientName}
Contact Person: ${contactNameForEmail}
Project/Quote Title: ${projectTitle}
Quote Reference: ${quote.reference || "Q-" + quote.id}
Total (inc VAT): ${total}${subtotal ? `\nSubtotal: ${subtotal}` : ""}${vatAmount ? `\nVAT: ${vatAmount}` : ""}

Scope Summary:\n${lineItemsSummary}

${keyNotes.length > 0 ? `Key Notes:\n${keyNotes.join("\n")}` : "No specific notes."}

Sender Company: ${user.companyName || "[Your Company]"}
Sender Name: ${user.name || "[Your Name]"}

IMPORTANT: Address the email greeting to the Contact Person (e.g. "Hi ${contactNameForEmail},"), NOT the company name.`,
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
            htmlBody: `<p style="font-family: Arial, sans-serif; margin-bottom: 16px;">Hi ${contactNameForEmail},</p>
<p style="font-family: Arial, sans-serif; margin-bottom: 16px;">Please find attached our quotation for ${projectTitle}.</p>
<p style="font-family: Arial, sans-serif; margin-bottom: 16px;"><strong>Total: ${total}</strong></p>
<p style="font-family: Arial, sans-serif; margin-bottom: 16px;">Please let me know if you have any questions.</p>
<p style="font-family: Arial, sans-serif; margin-bottom: 16px;">Kind regards,<br/>${user.name || "[Your Name]"}<br/>${user.companyName || ""}</p>`,
            textBody: `Hi ${contactNameForEmail},\n\nPlease find attached our quotation for ${projectTitle}.\n\nTotal: ${total}\n\nPlease let me know if you have any questions.\n\nKind regards,\n${user.name || "[Your Name]"}\n${user.companyName || ""}`,
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

    // Update text content for an existing input (used for email/text editing)
    updateContent: protectedProcedure
      .input(z.object({
        id: z.number(),
        quoteId: z.number(),
        content: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        const quote = await getQuoteWithOrgAccess(input.quoteId, ctx.user.id);
        if (!quote) throw new Error("Quote not found");

        const inputRecord = await getInputById(input.id);
        if (!inputRecord) throw new Error("Input not found");
        if (inputRecord.quoteId !== input.quoteId) throw new Error("Input does not belong to this quote");

        await updateInputContent(input.id, input.content);

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
                // Use OpenAI for PDF analysis (higher rate limits, no separate API key needed)
                if (!isOpenAIConfigured()) {
                  throw new Error("OPENAI_API_KEY is not configured. OpenAI API is required for PDF analysis.");
                }

                // Download PDF from R2 storage and analyze with OpenAI
                const pdfBuffer = await getFileBuffer(key);
                
                processedContent = await analyzePdfWithOpenAI(
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

              // ── Auto-run electrical takeoff for PDFs (server-side) ──
              // This ensures takeoffs run regardless of which input is selected in the UI.
              // Previously, takeoffs only ran when TakeoffPanel mounted (required the PDF to be selected).
              if (input.inputType === "pdf") {
                try {
                  // Check if a takeoff already exists for this input (avoid duplicates)
                  const existingTakeoff = await getElectricalTakeoffByInputId(inputRecord.id);
                  if (!existingTakeoff) {
                    console.log(`[Auto-takeoff] Running electrical takeoff for input ${inputRecord.id}`);
                    const pdfBuf = await getFileBuffer(key);
                    const takeoffResult = await performElectricalTakeoff(pdfBuf, input.filename || 'Unknown');
                    const svgOverlay = generateSvgOverlay(takeoffResult);

                    await createElectricalTakeoff({
                      quoteId: input.quoteId,
                      inputId: inputRecord.id,
                      drawingRef: takeoffResult.drawingRef,
                      status: takeoffResult.questions.length > 0 ? 'questions' : 'draft',
                      pageWidth: takeoffResult.pageWidth.toString(),
                      pageHeight: takeoffResult.pageHeight.toString(),
                      symbols: takeoffResult.symbols,
                      counts: takeoffResult.counts,
                      questions: takeoffResult.questions,
                      userAnswers: {},
                      drawingNotes: takeoffResult.notes,
                      dbCircuits: takeoffResult.dbCircuits,
                      hasTextLayer: takeoffResult.hasTextLayer,
                      totalTextElements: takeoffResult.totalTextElements,
                      svgOverlay,
                    });

                    // Update processedContent with takeoff summary (richer than OpenAI extraction)
                    await updateInputProcessing(inputRecord.id, {
                      processedContent: formatTakeoffForQuoteContext(takeoffResult),
                      processingStatus: "completed",
                    });

                    console.log(`[Auto-takeoff] Electrical takeoff complete: ${Object.keys(takeoffResult.counts).length} symbol types`);

                    // Auto-detect containment drawing and run containment takeoff
                    try {
                      let pdfTextForDetection = input.filename || '';
                      try {
                        const pdfExtract = await extractWithPdfJs(pdfBuf);
                        pdfTextForDetection = pdfExtract.words.map((w: any) => w.text).join(' ') + ' ' + pdfTextForDetection;
                      } catch { /* If text extraction fails, fall back to filename only */ }

                      if (isContainmentDrawing(pdfTextForDetection)) {
                        console.log(`[Auto-takeoff] Containment drawing detected, auto-running containment takeoff`);
                        const containmentResult = await performContainmentTakeoff(
                          pdfBuf,
                          input.filename || 'Unknown',
                          extractWithPdfJs,
                          extractPdfLineColours,
                        );
                        const containmentSvg = generateContainmentSvgOverlay(
                          containmentResult.trayRuns,
                          containmentResult.pageWidth,
                          containmentResult.pageHeight,
                        );
                        const defaultUserInputs = {
                          trayFilter: "LV", trayDuty: "medium",
                          extraDropPerFitting: 2.0, firstPointRunLength: 15.0,
                          numberOfCircuits: 0, additionalCablePercent: 10,
                        };
                        const cableSummary = calculateCableSummary(containmentResult.trayRuns, defaultUserInputs);
                        await createContainmentTakeoff({
                          quoteId: input.quoteId,
                          inputId: inputRecord.id,
                          drawingRef: containmentResult.drawingRef,
                          status: containmentResult.questions.length > 0 ? "questions" : "draft",
                          pageWidth: containmentResult.pageWidth.toString(),
                          pageHeight: containmentResult.pageHeight.toString(),
                          detectedScale: containmentResult.detectedScale,
                          paperSize: containmentResult.paperSize,
                          trayRuns: containmentResult.trayRuns as any,
                          fittingSummary: containmentResult.fittingSummary as any,
                          userInputs: defaultUserInputs as any,
                          cableSummary: cableSummary as any,
                          questions: containmentResult.questions as any,
                          userAnswers: {},
                          drawingNotes: containmentResult.drawingNotes,
                          svgOverlay: containmentSvg,
                        });
                        console.log(`[Auto-takeoff] Containment takeoff created: ${containmentResult.trayRuns.length} tray runs`);
                      }
                    } catch (containmentErr: any) {
                      console.warn(`[Auto-takeoff] Containment auto-detection failed (non-fatal):`, containmentErr.message);
                    }
                  } else {
                    console.log(`[Auto-takeoff] Takeoff already exists for input ${inputRecord.id}, skipping`);
                  }
                } catch (takeoffErr: any) {
                  // Non-fatal — the takeoff can still be triggered manually via the UI
                  console.warn(`[Auto-takeoff] Electrical takeoff failed (non-fatal):`, takeoffErr.message);
                }
              }
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
          
          // Use OpenAI GPT-4 Turbo for faster processing with higher rate limits
          const extractedText = await analyzePdfWithOpenAI(
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

  // ============ ELECTRICAL TAKEOFF ============
  electricalTakeoff: router({
    // Get all takeoffs for a quote
    list: protectedProcedure
      .input(z.object({ quoteId: z.number() }))
      .query(async ({ ctx, input }) => {
        const quote = await getQuoteWithOrgAccess(input.quoteId, ctx.user.id);
        if (!quote) throw new Error("Quote not found");
        const takeoffs = await getElectricalTakeoffsByQuoteId(input.quoteId);
        return takeoffs.map(t => ({
          ...t,
          symbolDescriptions: SYMBOL_DESCRIPTIONS,
        }));
      }),

    // Get single takeoff with SVG overlay
    get: protectedProcedure
      .input(z.object({ takeoffId: z.number() }))
      .query(async ({ ctx, input }) => {
        const takeoff = await getElectricalTakeoffById(input.takeoffId);
        if (!takeoff) throw new Error("Takeoff not found");
        
        const quote = await getQuoteWithOrgAccess(takeoff.quoteId, ctx.user.id);
        if (!quote) throw new Error("Access denied");
        
        return {
          ...takeoff,
          symbolStyles: SYMBOL_STYLES,
          symbolDescriptions: SYMBOL_DESCRIPTIONS,
        };
      }),

    // Get takeoff for a specific input (drawing)
    getByInputId: protectedProcedure
      .input(z.object({ inputId: z.number() }))
      .query(async ({ ctx, input }) => {
        const takeoff = await getElectricalTakeoffByInputId(input.inputId);
        if (!takeoff) return null;
        
        const quote = await getQuoteWithOrgAccess(takeoff.quoteId, ctx.user.id);
        if (!quote) throw new Error("Access denied");
        
        return {
          ...takeoff,
          symbolStyles: SYMBOL_STYLES,
          symbolDescriptions: SYMBOL_DESCRIPTIONS,
        };
      }),

    // Run takeoff extraction on a drawing
    analyze: protectedProcedure
      .input(z.object({
        inputId: z.number(),
        quoteId: z.number(),
        force: z.boolean().optional(), // true = re-analyse (skip duplicate check)
      }))
      .mutation(async ({ ctx, input }) => {
        const quote = await getQuoteWithOrgAccess(input.quoteId, ctx.user.id);
        if (!quote) throw new Error("Quote not found");
        
        // Get the input record to find the PDF file
        const inputRecord = await getInputById(input.inputId);
        if (!inputRecord || !inputRecord.fileKey) {
          throw new Error("Input file not found");
        }

        // Unless force=true (re-analyse), check if a takeoff already exists.
        // The server auto-creates takeoffs during PDF upload, so the frontend auto-run
        // may fire before it knows the takeoff exists. Return the existing one to avoid duplicates.
        if (!input.force) {
          const existingTakeoff = await getElectricalTakeoffByInputId(input.inputId);
          if (existingTakeoff) {
            return {
              takeoff: existingTakeoff,
              symbolStyles: SYMBOL_STYLES,
              symbolDescriptions: SYMBOL_DESCRIPTIONS,
            };
          }
        }
        
        // Download PDF from R2
        const pdfBuffer = await getFileBuffer(inputRecord.fileKey);
        
        // Run electrical takeoff extraction
        const result = await performElectricalTakeoff(pdfBuffer, inputRecord.filename || 'Unknown');
        
        // Generate SVG overlay
        const svgOverlay = generateSvgOverlay(result);
        
        // Save to database
        const takeoff = await createElectricalTakeoff({
          quoteId: input.quoteId,
          inputId: input.inputId,
          drawingRef: result.drawingRef,
          status: result.questions.length > 0 ? 'questions' : 'draft',
          pageWidth: result.pageWidth.toString(),
          pageHeight: result.pageHeight.toString(),
          symbols: result.symbols,
          counts: result.counts,
          questions: result.questions,
          userAnswers: {},
          drawingNotes: result.notes,
          dbCircuits: result.dbCircuits,
          hasTextLayer: result.hasTextLayer,
          totalTextElements: result.totalTextElements,
          svgOverlay,
        });
        
        // Also update the input's processed content with takeoff summary
        await updateInputProcessing(input.inputId, {
          processedContent: formatTakeoffForQuoteContext(result),
          processingStatus: "completed",
        });

        // Auto-detect containment drawing and run containment takeoff too
        // Extract actual PDF text for detection (symbol codes alone don't contain tray keywords)
        try {
          let pdfTextForDetection = inputRecord.filename || '';
          try {
            const pdfExtract = await extractWithPdfJs(pdfBuffer);
            pdfTextForDetection = pdfExtract.words.map((w: any) => w.text).join(' ') + ' ' + pdfTextForDetection;
          } catch { /* If text extraction fails, fall back to filename only */ }
          if (isContainmentDrawing(pdfTextForDetection)) {
            console.log(`[Electrical Takeoff] Containment drawing detected, auto-running containment takeoff`);
            const containmentResult = await performContainmentTakeoff(
              pdfBuffer,
              inputRecord.filename || 'Unknown',
              extractWithPdfJs,
              extractPdfLineColours,
            );
            const containmentSvg = generateContainmentSvgOverlay(
              containmentResult.trayRuns,
              containmentResult.pageWidth,
              containmentResult.pageHeight,
            );
            const defaultUserInputs = {
              trayFilter: "LV", trayDuty: "medium",
              extraDropPerFitting: 2.0, firstPointRunLength: 15.0,
              numberOfCircuits: 0, additionalCablePercent: 10,
            };
            const cableSummary = calculateCableSummary(containmentResult.trayRuns, defaultUserInputs);
            await createContainmentTakeoff({
              quoteId: input.quoteId,
              inputId: input.inputId,
              drawingRef: containmentResult.drawingRef,
              status: containmentResult.questions.length > 0 ? "questions" : "draft",
              pageWidth: containmentResult.pageWidth.toString(),
              pageHeight: containmentResult.pageHeight.toString(),
              detectedScale: containmentResult.detectedScale,
              paperSize: containmentResult.paperSize,
              trayRuns: containmentResult.trayRuns as any,
              fittingSummary: containmentResult.fittingSummary as any,
              userInputs: defaultUserInputs as any,
              cableSummary: cableSummary as any,
              questions: containmentResult.questions as any,
              userAnswers: {},
              drawingNotes: containmentResult.drawingNotes,
              svgOverlay: containmentSvg,
            });
            console.log(`[Electrical Takeoff] Containment takeoff created: ${containmentResult.trayRuns.length} tray runs`);
          }
        } catch (containmentErr: any) {
          console.warn(`[Electrical Takeoff] Containment auto-detection failed (non-fatal):`, containmentErr.message);
        }
        
        return {
          takeoff,
          symbolStyles: SYMBOL_STYLES,
          symbolDescriptions: SYMBOL_DESCRIPTIONS,
        };
      }),

    // Submit answers to takeoff questions
    answerQuestions: protectedProcedure
      .input(z.object({
        takeoffId: z.number(),
        answers: z.record(z.string(), z.string()),
      }))
      .mutation(async ({ ctx, input }) => {
        const takeoff = await getElectricalTakeoffById(input.takeoffId);
        if (!takeoff) throw new Error("Takeoff not found");
        
        const quote = await getQuoteWithOrgAccess(takeoff.quoteId, ctx.user.id);
        if (!quote) throw new Error("Access denied");
        
        // Rebuild result from stored data and apply answers
        const storedResult = {
          drawingRef: takeoff.drawingRef || '',
          pageWidth: Number(takeoff.pageWidth) || 0,
          pageHeight: Number(takeoff.pageHeight) || 0,
          symbols: takeoff.symbols || [],
          counts: takeoff.counts || {},
          questions: takeoff.questions || [],
          notes: takeoff.drawingNotes || [],
          dbCircuits: takeoff.dbCircuits || [],
          hasTextLayer: takeoff.hasTextLayer ?? true,
          totalTextElements: takeoff.totalTextElements || 0,
        };
        
        const updated = applyUserAnswers(storedResult, input.answers);
        const svgOverlay = generateSvgOverlay(updated);
        
        // Update database
        const updatedTakeoff = await updateElectricalTakeoff(takeoff.id, {
          symbols: updated.symbols,
          counts: updated.counts,
          userAnswers: input.answers,
          svgOverlay,
          status: 'draft',
        });
        
        // Update input processed content with new counts
        if (takeoff.inputId) {
          await updateInputProcessing(Number(takeoff.inputId), {
            processedContent: formatTakeoffForQuoteContext(updated),
          });
        }
        
        return {
          takeoff: updatedTakeoff,
          symbolStyles: SYMBOL_STYLES,
          symbolDescriptions: SYMBOL_DESCRIPTIONS,
        };
      }),

    // Verify takeoff (lock counts)
    verify: protectedProcedure
      .input(z.object({ takeoffId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const takeoff = await getElectricalTakeoffById(input.takeoffId);
        if (!takeoff) throw new Error("Takeoff not found");
        
        const quote = await getQuoteWithOrgAccess(takeoff.quoteId, ctx.user.id);
        if (!quote) throw new Error("Access denied");
        
        const updatedTakeoff = await updateElectricalTakeoff(takeoff.id, {
          status: 'verified',
          verifiedAt: new Date(),
          verifiedBy: BigInt(ctx.user.id) as any,
        });
        
        return { verified: true, takeoff: updatedTakeoff };
      }),

    // Unlock a verified takeoff to allow re-analysis
    unlock: protectedProcedure
      .input(z.object({ takeoffId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const takeoff = await getElectricalTakeoffById(input.takeoffId);
        if (!takeoff) throw new Error("Takeoff not found");
        
        const quote = await getQuoteWithOrgAccess(takeoff.quoteId, ctx.user.id);
        if (!quote) throw new Error("Access denied");
        
        const updatedTakeoff = await updateElectricalTakeoff(takeoff.id, {
          status: 'draft',
          verifiedAt: null,
          verifiedBy: null,
        });
        
        return { unlocked: true, takeoff: updatedTakeoff };
      }),

    // Update user-excluded symbol codes (persists chip toggling)
    updateExcludedCodes: protectedProcedure
      .input(z.object({
        takeoffId: z.number(),
        excludedCodes: z.array(z.string()),
      }))
      .mutation(async ({ ctx, input }) => {
        const takeoff = await getElectricalTakeoffById(input.takeoffId);
        if (!takeoff) throw new Error("Takeoff not found");
        
        const quote = await getQuoteWithOrgAccess(takeoff.quoteId, ctx.user.id);
        if (!quote) throw new Error("Access denied");
        
        // Store in userAnswers under a special key
        const existingAnswers = (takeoff.userAnswers || {}) as Record<string, string>;
        const updatedAnswers = {
          ...existingAnswers,
          _excludedCodes: JSON.stringify(input.excludedCodes),
        };
        
        const updatedTakeoff = await updateElectricalTakeoff(takeoff.id, {
          userAnswers: updatedAnswers,
        });

        // Also update the processedContent to reflect excluded codes
        if (takeoff.inputId) {
          const storedResult = {
            drawingRef: takeoff.drawingRef || '',
            pageWidth: Number(takeoff.pageWidth) || 0,
            pageHeight: Number(takeoff.pageHeight) || 0,
            symbols: takeoff.symbols || [],
            counts: takeoff.counts || {},
            questions: takeoff.questions || [],
            notes: takeoff.drawingNotes || [],
            dbCircuits: takeoff.dbCircuits || [],
            hasTextLayer: takeoff.hasTextLayer ?? true,
            totalTextElements: takeoff.totalTextElements || 0,
          };
          // Filter counts by excluded codes for quote context
          const filteredCounts: Record<string, number> = {};
          for (const [code, count] of Object.entries(storedResult.counts as Record<string, number>)) {
            if (!input.excludedCodes.includes(code)) {
              filteredCounts[code] = count;
            }
          }
          const filteredResult = { ...storedResult, counts: filteredCounts };
          await updateInputProcessing(Number(takeoff.inputId), {
            processedContent: formatTakeoffForQuoteContext(filteredResult),
          });
        }
        
        return { success: true };
      }),

    // Get PDF file data as base64 for client-side rendering (avoids CORS issues with R2)
    getPdfData: protectedProcedure
      .input(z.object({ inputId: z.number() }))
      .query(async ({ ctx, input }) => {
        const inputRecord = await getInputById(input.inputId);
        if (!inputRecord || !inputRecord.fileKey) {
          throw new Error("Input file not found");
        }

        // Verify access through quote
        const quote = await getQuoteWithOrgAccess(inputRecord.quoteId, ctx.user.id);
        if (!quote) throw new Error("Access denied");

        const pdfBuffer = await getFileBuffer(inputRecord.fileKey);
        const base64 = pdfBuffer.toString('base64');
        return { base64, filename: inputRecord.filename || 'drawing.pdf' };
      }),

    // Update markers — add/remove markers from the viewer and recalculate counts
    updateMarkers: protectedProcedure
      .input(z.object({
        takeoffId: z.number(),
        removedIds: z.array(z.string()), // symbol IDs to remove
        addedMarkers: z.array(z.object({
          symbolCode: z.string(),
          x: z.number(),
          y: z.number(),
        })),
      }))
      .mutation(async ({ ctx, input }) => {
        const takeoff = await getElectricalTakeoffById(input.takeoffId);
        if (!takeoff) throw new Error("Takeoff not found");

        const quote = await getQuoteWithOrgAccess(takeoff.quoteId, ctx.user.id);
        if (!quote) throw new Error("Access denied");

        if (takeoff.status === 'verified') {
          throw new Error("Cannot edit markers on an approved takeoff. Please unlock first.");
        }

        // Get current symbols
        const currentSymbols = (takeoff.symbols || []) as Array<{
          id: string; symbolCode: string; category: string;
          x: number; y: number; confidence: string;
          isStatusMarker: boolean; nearbySymbol?: string;
        }>;

        // Remove specified markers
        let updatedSymbols = currentSymbols.filter(s => !input.removedIds.includes(s.id));

        // Add new markers
        for (const added of input.addedMarkers) {
          const newId = `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          updatedSymbols.push({
            id: newId,
            symbolCode: added.symbolCode,
            category: 'manual',
            x: added.x,
            y: added.y,
            confidence: 'manual',
            isStatusMarker: false,
          });
        }

        // Recalculate counts (exclude status markers)
        const newCounts: Record<string, number> = {};
        for (const sym of updatedSymbols) {
          if (!sym.isStatusMarker) {
            newCounts[sym.symbolCode] = (newCounts[sym.symbolCode] || 0) + 1;
          }
        }

        // Regenerate SVG overlay
        const pageWidth = parseFloat(takeoff.pageWidth as string) || 2384;
        const pageHeight = parseFloat(takeoff.pageHeight as string) || 1684;
        const svgOverlay = generateSvgOverlay({
          drawingRef: takeoff.drawingRef || '',
          pageWidth,
          pageHeight,
          symbols: updatedSymbols as any,
          counts: newCounts,
          questions: [],
          drawingNotes: [],
          dbCircuits: [],
          hasTextLayer: takeoff.hasTextLayer ?? true,
          totalTextElements: takeoff.totalTextElements || 0,
        });

        // Save
        const updated = await updateElectricalTakeoff(takeoff.id, {
          symbols: updatedSymbols as any,
          counts: newCounts as any,
          svgOverlay,
          updatedAt: new Date(),
        });

        return {
          takeoff: updated,
          counts: newCounts,
          symbolCount: updatedSymbols.filter(s => !s.isStatusMarker).length,
        };
      }),
  }),

  // ============ CONTAINMENT TAKEOFF (Tray/Cable Measurement) ============
  containmentTakeoff: router({
    // Get all containment takeoffs for a quote
    list: protectedProcedure
      .input(z.object({ quoteId: z.number() }))
      .query(async ({ ctx, input }) => {
        const quote = await getQuoteWithOrgAccess(input.quoteId, ctx.user.id);
        if (!quote) throw new Error("Quote not found");
        const takeoffs = await getContainmentTakeoffsByQuoteId(input.quoteId);
        return takeoffs.map(t => ({
          ...t,
          traySizeColours: TRAY_SIZE_COLOURS,
        }));
      }),

    // Get single containment takeoff
    get: protectedProcedure
      .input(z.object({ takeoffId: z.number() }))
      .query(async ({ ctx, input }) => {
        const takeoff = await getContainmentTakeoffById(input.takeoffId);
        if (!takeoff) throw new Error("Takeoff not found");

        const quote = await getQuoteWithOrgAccess(takeoff.quoteId, ctx.user.id);
        if (!quote) throw new Error("Access denied");

        return {
          ...takeoff,
          traySizeColours: TRAY_SIZE_COLOURS,
        };
      }),

    // Get containment takeoff for a specific input (drawing)
    getByInputId: protectedProcedure
      .input(z.object({ inputId: z.number() }))
      .query(async ({ ctx, input }) => {
        const takeoff = await getContainmentTakeoffByInputId(input.inputId);
        if (!takeoff) return null;

        const quote = await getQuoteWithOrgAccess(takeoff.quoteId, ctx.user.id);
        if (!quote) throw new Error("Access denied");

        return {
          ...takeoff,
          traySizeColours: TRAY_SIZE_COLOURS,
        };
      }),

    // Run containment takeoff analysis on a drawing
    analyze: protectedProcedure
      .input(z.object({
        inputId: z.number(),
        quoteId: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        const quote = await getQuoteWithOrgAccess(input.quoteId, ctx.user.id);
        if (!quote) throw new Error("Quote not found");

        const inputRecord = await getInputById(input.inputId);
        if (!inputRecord || !inputRecord.fileKey) {
          throw new Error("Input file not found");
        }

        // Download PDF from R2
        const pdfBuffer = await getFileBuffer(inputRecord.fileKey);

        // Run containment takeoff extraction
        const result = await performContainmentTakeoff(
          pdfBuffer,
          inputRecord.filename || "Unknown",
          extractWithPdfJs,
          extractPdfLineColours,
        );

        // Generate SVG overlay for marked drawing
        const svgOverlay = generateContainmentSvgOverlay(
          result.trayRuns,
          result.pageWidth,
          result.pageHeight,
        );

        // Default user inputs
        const defaultUserInputs = {
          trayFilter: "LV",
          trayDuty: "medium",
          extraDropPerFitting: 2.0,
          firstPointRunLength: 15.0,
          numberOfCircuits: 0,
          additionalCablePercent: 10,
        };

        // Calculate initial cable summary
        const cableSummary = calculateCableSummary(result.trayRuns, defaultUserInputs);

        // Save to database
        const takeoff = await createContainmentTakeoff({
          quoteId: input.quoteId,
          inputId: input.inputId,
          drawingRef: result.drawingRef,
          status: result.questions.length > 0 ? "questions" : "draft",
          pageWidth: result.pageWidth.toString(),
          pageHeight: result.pageHeight.toString(),
          detectedScale: result.detectedScale,
          paperSize: result.paperSize,
          trayRuns: result.trayRuns as any,
          fittingSummary: result.fittingSummary as any,
          userInputs: defaultUserInputs as any,
          cableSummary: cableSummary as any,
          questions: result.questions as any,
          userAnswers: {},
          drawingNotes: result.drawingNotes,
          svgOverlay,
        });

        // Update input's processed content with containment context
        await updateInputProcessing(input.inputId, {
          processedContent: formatContainmentForQuoteContext(
            result.trayRuns,
            result.fittingSummary,
            cableSummary,
            defaultUserInputs,
          ),
          processingStatus: "completed",
        });

        return {
          takeoff,
          traySizeColours: TRAY_SIZE_COLOURS,
        };
      }),

    // Update user inputs and recalculate cable summary
    updateUserInputs: protectedProcedure
      .input(z.object({
        takeoffId: z.number(),
        userInputs: z.object({
          trayFilter: z.string(),
          trayDuty: z.string(),
          extraDropPerFitting: z.number(),
          firstPointRunLength: z.number(),
          numberOfCircuits: z.number(),
          additionalCablePercent: z.number(),
        }),
      }))
      .mutation(async ({ ctx, input }) => {
        const takeoff = await getContainmentTakeoffById(input.takeoffId);
        if (!takeoff) throw new Error("Takeoff not found");

        const quote = await getQuoteWithOrgAccess(takeoff.quoteId, ctx.user.id);
        if (!quote) throw new Error("Access denied");

        // Recalculate cable summary with new inputs
        const trayRuns = (takeoff.trayRuns || []) as any[];
        const cableSummary = calculateCableSummary(trayRuns, input.userInputs);

        // Filter tray runs by type if needed
        const filteredRuns = input.userInputs.trayFilter === "all"
          ? trayRuns
          : trayRuns.filter((r: any) => r.trayType === input.userInputs.trayFilter);

        // Regenerate SVG overlay with filtered runs
        const svgOverlay = generateContainmentSvgOverlay(
          filteredRuns,
          Number(takeoff.pageWidth) || 0,
          Number(takeoff.pageHeight) || 0,
        );

        const updated = await updateContainmentTakeoff(takeoff.id, {
          userInputs: input.userInputs as any,
          cableSummary: cableSummary as any,
          svgOverlay,
        });

        // Update input processed content
        if (takeoff.inputId) {
          await updateInputProcessing(Number(takeoff.inputId), {
            processedContent: formatContainmentForQuoteContext(
              filteredRuns,
              (takeoff.fittingSummary || {}) as any,
              cableSummary,
              input.userInputs,
            ),
          });
        }

        return {
          takeoff: updated,
          traySizeColours: TRAY_SIZE_COLOURS,
        };
      }),

    // Update tray run measurements manually (user corrections)
    updateTrayRuns: protectedProcedure
      .input(z.object({
        takeoffId: z.number(),
        trayRuns: z.array(z.object({
          id: z.string(),
          sizeMillimetres: z.number(),
          trayType: z.string(),
          lengthMetres: z.number(),
          heightMetres: z.number(),
          tPieces: z.number(),
          crossPieces: z.number(),
          bends90: z.number(),
          drops: z.number(),
        })),
      }))
      .mutation(async ({ ctx, input }) => {
        const takeoff = await getContainmentTakeoffById(input.takeoffId);
        if (!takeoff) throw new Error("Takeoff not found");

        const quote = await getQuoteWithOrgAccess(takeoff.quoteId, ctx.user.id);
        if (!quote) throw new Error("Access denied");

        // Merge user edits with existing segment data
        const existingRuns = (takeoff.trayRuns || []) as any[];
        const updatedRuns = input.trayRuns.map(edited => {
          const existing = existingRuns.find((r: any) => r.id === edited.id);
          return {
            ...existing,
            ...edited,
            wholesalerLengths: Math.ceil(edited.lengthMetres / 3),
            segments: existing?.segments || [],
          };
        });

        // Rebuild fitting summary
        const fittingSummary: Record<string, any> = {};
        for (const run of updatedRuns) {
          const sizeKey = `${run.sizeMillimetres}mm`;
          if (!fittingSummary[sizeKey]) {
            fittingSummary[sizeKey] = { tPieces: 0, crossPieces: 0, bends90: 0, drops: 0, couplers: 0 };
          }
          fittingSummary[sizeKey].tPieces += run.tPieces;
          fittingSummary[sizeKey].crossPieces += run.crossPieces;
          fittingSummary[sizeKey].bends90 += run.bends90;
          fittingSummary[sizeKey].drops += run.drops;
          fittingSummary[sizeKey].couplers += Math.max(0, run.wholesalerLengths - 1);
        }

        // Recalculate cable summary
        const userInputs = (takeoff.userInputs || {}) as any;
        const cableSummary = calculateCableSummary(updatedRuns, userInputs);

        const updated = await updateContainmentTakeoff(takeoff.id, {
          trayRuns: updatedRuns as any,
          fittingSummary: fittingSummary as any,
          cableSummary: cableSummary as any,
        });

        return {
          takeoff: updated,
          traySizeColours: TRAY_SIZE_COLOURS,
        };
      }),

    // Verify containment takeoff (lock measurements)
    verify: protectedProcedure
      .input(z.object({ takeoffId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const takeoff = await getContainmentTakeoffById(input.takeoffId);
        if (!takeoff) throw new Error("Takeoff not found");

        const quote = await getQuoteWithOrgAccess(takeoff.quoteId, ctx.user.id);
        if (!quote) throw new Error("Access denied");

        const updated = await updateContainmentTakeoff(takeoff.id, {
          status: "verified",
          verifiedAt: new Date(),
          verifiedBy: BigInt(ctx.user.id) as any,
        });

        return { verified: true, takeoff: updated };
      }),

    // Unlock a verified containment takeoff
    unlock: protectedProcedure
      .input(z.object({ takeoffId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const takeoff = await getContainmentTakeoffById(input.takeoffId);
        if (!takeoff) throw new Error("Takeoff not found");

        const quote = await getQuoteWithOrgAccess(takeoff.quoteId, ctx.user.id);
        if (!quote) throw new Error("Access denied");

        const updated = await updateContainmentTakeoff(takeoff.id, {
          status: "draft",
          verifiedAt: null,
          verifiedBy: null,
        });

        return { unlocked: true, takeoff: updated };
      }),

    // Update excluded containment codes (user toggles in drawing viewer)
    updateExcludedCodes: protectedProcedure
      .input(z.object({
        takeoffId: z.number(),
        excludedCodes: z.array(z.string()),
      }))
      .mutation(async ({ ctx, input }) => {
        const takeoff = await getContainmentTakeoffById(input.takeoffId);
        if (!takeoff) throw new Error("Takeoff not found");

        const quote = await getQuoteWithOrgAccess(takeoff.quoteId, ctx.user.id);
        if (!quote) throw new Error("Access denied");

        const userAnswers = (takeoff.userAnswers || {}) as Record<string, any>;
        userAnswers._excludedCodes = JSON.stringify(input.excludedCodes);

        const updated = await updateContainmentTakeoff(takeoff.id, {
          userAnswers: userAnswers as any,
        });

        return { updated: true, takeoff: updated };
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
        installTimeHrs: z.string().optional(),
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
        installTimeHrs: z.string().optional(),
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

  // ============ SUBSCRIPTION (real router with Stripe integration) ============
  subscription: subscriptionRouter,

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

    // Save edited voice summary back to the voice note content (Option C)
    saveVoiceNoteSummary: protectedProcedure
      .input(z.object({
        quoteId: z.number(),
        summary: z.object({
          clientName: z.string().nullable(),
          jobDescription: z.string(),
          labour: z.array(z.object({ role: z.string(), quantity: z.number().default(1), duration: z.string() })),
          materials: z.array(z.object({ item: z.string(), quantity: z.number().default(1), unitPrice: z.number().nullable() })),
          markup: z.number().nullable(),
          sundries: z.number().nullable(),
          contingency: z.string().nullable(),
          notes: z.string().nullable(),
        }),
      }))
      .mutation(async ({ ctx, input }) => {
        const quote = await getQuoteWithOrgAccess(input.quoteId, ctx.user.id);
        if (!quote) throw new Error("Quote not found");

        // Build structured text from the summary
        const parts: string[] = [];
        parts.push(`Job: ${input.summary.jobDescription}`);
        if (input.summary.clientName) parts.push(`Client: ${input.summary.clientName}`);
        if (input.summary.labour.length > 0) {
          parts.push("Labour: " + input.summary.labour.map(l => `${l.quantity} × ${l.role} — ${l.duration}`).join(", "));
        }
        if (input.summary.materials.length > 0) {
          parts.push("Materials: " + input.summary.materials.map(m => `${m.quantity} × ${m.item}${m.unitPrice ? ` @ £${m.unitPrice}` : ""}`).join(", "));
        }
        if (input.summary.markup !== null) parts.push(`Markup: ${input.summary.markup}%`);
        if (input.summary.sundries !== null) parts.push(`Sundries: £${input.summary.sundries}`);
        if (input.summary.contingency) parts.push(`Contingency: ${input.summary.contingency}`);
        if (input.summary.notes) parts.push(`Notes: ${input.summary.notes}`);

        const structuredContent = parts.join("\n");

        // Find the latest voice note for this quote and update its content
        const inputRecords = await getInputsByQuoteId(input.quoteId);
        const voiceNotes = inputRecords
          .filter((inp: any) => inp.inputType === "audio" && inp.content && !inp.fileUrl)
          .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        if (voiceNotes.length > 0) {
          await updateInputContent(voiceNotes[0].id, structuredContent);
          console.log(`[saveVoiceNoteSummary] Updated voice note ${voiceNotes[0].id} with structured content`);
        }

        return { success: true };
      }),

    // Parse all inputs (voice, documents, text) into structured summary for QDS
    parseDictationSummary: protectedProcedure
      .input(z.object({
        quoteId: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        console.log(`[parseDictationSummary] Starting for quoteId=${input.quoteId}`);

        const quote = await getQuoteWithOrgAccess(input.quoteId, ctx.user.id);
        if (!quote) throw new Error("Quote not found");

        const inputRecords = await getInputsByQuoteId(input.quoteId);

        // Collect all voice notes, text content, and processed document content
        const allContent: string[] = [];
        for (const inp of inputRecords) {
          if (inp.inputType === "audio" && inp.content && !inp.fileUrl) {
            allContent.push(`Voice Note (${inp.filename || "untitled"}): ${inp.content}`);
          } else if (inp.inputType === "audio" && inp.content && inp.fileUrl) {
            // Transcribed audio file
            allContent.push(`Audio Transcription (${inp.filename || "untitled"}): ${inp.content}`);
          } else if (inp.content && !inp.fileUrl) {
            allContent.push(`Text Input: ${inp.content}`);
          }
          // Also include processed/extracted content from documents
          if (inp.processedContent) {
            allContent.push(`Document (${inp.filename || inp.inputType}): ${inp.processedContent.substring(0, 2000)}`);
          } else if (inp.extractedText) {
            allContent.push(`Extracted Text (${inp.filename || inp.inputType}): ${inp.extractedText.substring(0, 2000)}`);
          }
        }

        if (allContent.length === 0) {
          return {
            hasSummary: false,
            summary: null,
          };
        }

        const tradePresetKey = (quote as any)?.tradePreset as string | null;
        const userTradeSector = ctx.user.defaultTradeSector || null;
        const tradeLabel = tradePresetKey || userTradeSector || "general trades/construction";

        // Fetch catalog items so the AI can match dictated items to catalog products/services
        const catalogItems = await getCatalogItemsByUserId(ctx.user.id);
        let catalogContext = "";
        if (catalogItems.length > 0) {
          catalogContext = `\n\nCOMPANY CATALOG — these are the user's products and services with their set prices:
${catalogItems.map(c => `- "${c.name}" | Sell: £${c.defaultRate}/${c.unit}${c.costPrice ? ` | Buy-in: £${c.costPrice}` : ""}${(c as any).installTimeHrs ? ` | Install: ${(c as any).installTimeHrs}hrs/unit` : ""} | Category: ${c.category || "General"}${c.description ? ` | ${c.description}` : ""}`).join("\n")}`;
        }

        const response = await invokeLLM({
          messages: [
            {
              role: "system",
              content: `You are a senior estimator for a "${tradeLabel}" business. Your job is to analyse ALL provided evidence (voice notes, emails, documents, text) and produce a structured Quote Draft Summary.

THINK LIKE AN EXPERIENCED PROFESSIONAL in the "${tradeLabel}" sector. Consider:
- What work is ACTUALLY being requested (not just what's literally said)
- What the standard approach would be for this type of job
- What catalog items from this business would apply
- What labour is realistically needed
- What assumptions you're making that the user should verify
- Whether this is a discovery/assessment phase or a full implementation quote

INPUT PROCESSING:
- Inputs are listed chronologically. Later inputs override earlier ones for quantities, prices, or scope changes.
- Emails contain conversation, signatures, disclaimers — extract ONLY the quotable content. Ignore "have a good weekend", email footers, legal disclaimers, confidentiality notices, and social pleasantries.
- Voice notes are natural speech — "quid" means pounds, "sparky" means electrician, "a day" typically means 8 hours, "half a day" means 4 hours in UK trades.
- When multiple inputs cover the same work, MERGE them into one coherent summary — never duplicate line items.

CLIENT EXTRACTION:
- Extract client details from email signatures, headers, or mentions: name, company, email, phone.
- The RECIPIENT of the quote is the client (the person asking for work), NOT the user (the person sending the quote).
- Look for patterns: "Dear [name]", "Hi [name]", email From/To headers, signature blocks with company name, phone, email, address.
- If an email chain shows the user replying to someone, the "someone" is the client.
${catalogContext}

CATALOG MATCHING RULES:
- When evidence mentions work that matches a catalog item, extract it as a material WITH the catalog sell price.
- Match by meaning, not exact words: "engineer onsite for a day" matches "IT Labour Onsite" if that's in the catalog.
- "half a day workshop" matches "IT Labour Workshop" if that's in the catalog.
- Use the CORRECT catalog item for each piece of work — don't use the same catalog rate for different items.
- If the user states a specific price that differs from catalog, use the USER's price.
- If no catalog item matches, set unitPrice to the user's stated price, or null if unknown.

MATERIALS vs LABOUR:
- "materials" in this system means ALL billable line items — physical products, services, deliverables, and time-based work that should appear as priced lines on the quote.
- "labour" means the team composition — roles and durations (e.g. "1 × engineer, one day"). This describes WHO is doing the work.
- The same work can appear in both: labour describes the team, materials describes the billable line item.
- Example: "one engineer onsite for a day" → labour: [{role: "engineer", quantity: 1, duration: "one day"}] AND materials: [{item: "IT Labour Onsite", quantity: 8, unitPrice: 99, unit: "Per Hour"}] if "IT Labour Onsite" is in the catalog at £99/hr.
- Physical items (cable, hardware, servers) go in materials ONLY, not labour.
- If the user gives a lump sum price (e.g. "the server costs £4,650"), extract as a material with quantity 1 and that price.

SCOPE REASONING:
- If the client is asking "is this possible?" or "can you help with this?" — this is likely a discovery/assessment phase. Consider extracting a smaller initial scope (assessment, site survey) rather than the full project.
- Note in the "notes" field if the full scope should be quoted separately after assessment.
- If the client describes a problem (e.g. "server going end of life"), reason about what the ${tradeLabel} business would typically propose as a solution.

DEDUPLICATION:
- If the same item appears in multiple inputs (e.g. mentioned in email AND voice note), include it ONCE.
- Prefer the more specific/detailed version with the most accurate quantity and price.
- Later inputs override earlier ones for the same item.

Respond ONLY with valid JSON in this exact format:
{
  "clientName": string | null,
  "clientEmail": string | null,
  "clientPhone": string | null,
  "jobDescription": string,
  "labour": [{"role": string, "quantity": number, "duration": string}],
  "materials": [{"item": string, "quantity": number, "unitPrice": number | null, "unit": string, "description": string}],
  "markup": number | null,
  "sundries": number | null,
  "contingency": string | null,
  "notes": string | null,
  "isTradeRelevant": boolean
}

FIELD GUIDELINES:
- clientName: Full name and/or company. E.g. "Bjorn Gladwell / Rosetti"
- clientEmail: Email address from signature or header
- clientPhone: Phone from signature or mentions
- jobDescription: 2-3 detailed sentences covering the FULL scope. Include specifics — server types, cable lengths, page counts, service descriptions. Write from the perspective of the quoting business describing the work they'll do.
- labour: Team composition with realistic durations. Think about what ${tradeLabel} professionals would need.
- materials: Every billable line item with catalog-matched prices where possible. Include "unit" matching catalog (Per Hour, each, metre, etc.) and "description" explaining what this covers.
- notes: Assumptions, site access requirements, items needing verification, phasing suggestions, anything the user should review.
- isTradeRelevant: false only if the content has nothing to do with ${tradeLabel} work.

If a field is not mentioned or cannot be determined, use null.`,
            },
            {
              role: "user",
              content: allContent.join("\n\n"),
            },
          ],
          response_format: { type: "json_object" },
          max_tokens: 1500,
        });

        const content = response.choices[0]?.message?.content;
        console.log(`[parseDictationSummary] LLM response: ${content?.substring(0, 200)}`);

        if (!content) {
          return { hasSummary: false, summary: null };
        }

        try {
          const parsed = JSON.parse(content);
          return {
            hasSummary: true,
            summary: parsed,
          };
        } catch {
          return { hasSummary: false, summary: null };
        }
      }),

    // Quick trade-relevance check before full generation (Option A guardrail)
    tradeRelevanceCheck: protectedProcedure
      .input(z.object({
        quoteId: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        console.log(`[tradeRelevanceCheck] Starting for quoteId=${input.quoteId}`);
        
        const quote = await getQuoteWithOrgAccess(input.quoteId, ctx.user.id);
        if (!quote) throw new Error("Quote not found");

        // Gather evidence summaries
        const inputRecords = await getInputsByQuoteId(input.quoteId);

        if (inputRecords.length === 0) {
          console.log(`[tradeRelevanceCheck] No inputs, skipping check`);
          return { relevant: true, message: "" }; // No evidence to check — let it proceed
        }

        // Build a brief summary of evidence for the check
        const evidenceSummary = inputRecords.map((inp: any) => {
          if (inp.inputType === "audio" && inp.content && !inp.fileUrl) {
            return `Voice note: "${inp.content.substring(0, 200)}"`;
          }
          if (inp.extractedText) {
            return `Document (${inp.filename || inp.inputType}): "${inp.extractedText.substring(0, 200)}"`;
          }
          if (inp.processedContent) {
            return `Processed (${inp.filename || inp.inputType}): "${inp.processedContent.substring(0, 200)}"`;
          }
          return `File: ${inp.filename || inp.inputType}`;
        }).join("\n");

        const tradePresetKey = (quote as any)?.tradePreset as string | null;
        // Fall back to user's default trade sector if not set on quote
        const userTradeSector = ctx.user.defaultTradeSector || null;
        const tradeLabel = tradePresetKey || userTradeSector || "general trades/construction";
        console.log(`[tradeRelevanceCheck] Trade: ${tradeLabel} (quote: ${tradePresetKey}, user: ${userTradeSector}), evidence: ${evidenceSummary.substring(0, 100)}`);

        const response = await invokeLLM({
          messages: [
            {
              role: "system",
              content: `You are a quick content classifier. Respond ONLY with valid JSON: {"relevant": true/false, "message": "string"}

The user runs a "${tradeLabel}" business. Check if the following evidence relates to ${tradeLabel} work (even loosely — buying materials, quoting for maintenance, hiring subcontractors all count as relevant).

If relevant: {"relevant": true, "message": ""}
If NOT relevant: {"relevant": false, "message": "Brief explanation of why this doesn't appear to relate to ${tradeLabel} work, and what the content actually seems to be about."}`,
            },
            {
              role: "user",
              content: evidenceSummary,
            },
          ],
          response_format: { type: "json_object" },
          max_tokens: 150,
        });

        const content = response.choices[0]?.message?.content;
        console.log(`[tradeRelevanceCheck] LLM response: ${content}`);
        if (!content) return { relevant: true, message: "" };

        try {
          const parsed = JSON.parse(content);
          return {
            relevant: parsed.relevant === true,
            message: parsed.message || "",
          };
        } catch {
          return { relevant: true, message: "" }; // If parsing fails, proceed
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

        // Fetch organization profile for company defaults
        const org = await getUserPrimaryOrg(ctx.user.id);
        const orgDefaults = org ? {
          companyName: org.companyName || ctx.user.companyName || null,
          workingHours: {
            start: (org as any).defaultWorkingHoursStart || "08:00",
            end: (org as any).defaultWorkingHoursEnd || "16:30",
            days: (org as any).defaultWorkingDays || "Monday to Friday",
          },
          insuranceLimits: (org as any).defaultInsuranceLimits || null,
          dayWorkRates: (org as any).defaultDayWorkRates || null,
          exclusions: (org as any).defaultExclusions || null,
          validityDays: (org as any).defaultValidityDays || 30,
          signatoryName: (org as any).defaultSignatoryName || ctx.user.name || null,
          signatoryPosition: (org as any).defaultSignatoryPosition || null,
          surfaceTreatment: (org as any).defaultSurfaceTreatment || null,
          returnVisitRate: (org as any).defaultReturnVisitRate || null,
          paymentTerms: (org as any).defaultPaymentTerms || null,
        } : null;

        // Build context from all processed inputs
        const processedEvidence: string[] = [];
        
        // Separate voice dictations for ordered processing
        let voiceNoteIndex = 0;
        
        for (const inp of inputs) {
          if (inp.processedContent && inp.processingStatus === "completed") {
            const typeLabel = inp.inputType === "audio" ? "Audio Transcription"
              : inp.inputType === "pdf" ? "PDF Content"
              : inp.inputType === "image" ? "Image Analysis"
              : inp.inputType === "email" ? "Email Content"
              : "Text Note";
            processedEvidence.push(`### ${typeLabel} (${inp.filename || "untitled"}):\n${inp.processedContent}`);
          } else if (inp.inputType === "audio" && inp.content && !inp.fileUrl) {
            // Voice dictation (no file URL = live dictation, not uploaded audio)
            voiceNoteIndex++;
            processedEvidence.push(`### Voice Dictation ${voiceNoteIndex} (${inp.filename || "Voice Note"}):\n${inp.content}`);
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

        // Log evidence summary for debugging
        console.log(`[generateDraft] Evidence pieces: ${processedEvidence.length}, total chars: ${processedEvidence.join('').length}`);
        // Log first 500 chars of each evidence piece to help diagnose parsing issues
        processedEvidence.forEach((e, i) => {
          console.log(`[generateDraft] Evidence[${i}] (${e.length} chars): ${e.substring(0, 500).replace(/\n/g, '\\n')}`);
        });

        // Build catalog context - structured for rate matching
        let catalogContext = "";
        if (catalogItems.length > 0) {
          catalogContext = `\n\nCOMPANY CATALOG — DEFAULT RATES (can be overridden by user instructions):
${catalogItems.map(c => `- "${c.name}" | Rate: £${c.defaultRate}/${c.unit} | Cost: £${c.costPrice || "n/a"} | Install: ${c.installTimeHrs ? c.installTimeHrs + "hrs" : "n/a"} | Category: ${c.category || "General"} | ${c.description || ""}`).join("\n")}

IMPORTANT: Use catalog rates as defaults, but if the user's voice dictation or instructions specify a different price, markup, or rate for an item, ALWAYS use the user's stated price instead.`;
        }

        // Price hierarchy instruction — added to all prompts
        const priceHierarchyContext = `\n\nPRICE & RATE HIERARCHY — FOLLOW THIS STRICTLY:
When determining prices, rates, markups, labour costs, and quantities, follow this priority order:
1. HIGHEST PRIORITY — "USER-CONFIRMED PRICED MATERIALS" from the user's instructions/draft summary. These are prices the user has reviewed and confirmed in the Quote Draft Summary. Use these EXACT prices — do not override them.
2. SECOND PRIORITY — User's voice dictations and written instructions. If the user says "charge £700 per day" or "battens are £30 each" or "20% markup", USE THOSE EXACT FIGURES.
3. THIRD PRIORITY — Company catalog rates. Use these when the user hasn't specified a price for that item.
4. FOURTH PRIORITY — Company default rates from settings (day work rates, material markup %, etc.). Use these when neither the user nor the catalog provides a rate.
5. LOWEST PRIORITY — Your own UK market rate estimates. Only use these when no other source provides a rate. If you must estimate a rate, set it to 0 and flag it in assumptions so the user can fill it in.

VOICE DICTATION PROCESSING:
- Voice dictations are numbered in order. If there are multiple, process them sequentially.
- Later voice notes override earlier ones. If Voice Note 1 says "one electrician" and Voice Note 3 says "actually make it two electricians", use two.
- Voice dictations may contain natural speech — extract structured data: client name, job description, labour requirements, material prices, markups, sundries, location, and timeline.
- If the user mentions a client name (e.g. "quote for ample storage"), match it to existing client data if available.
- If the user gives a lump sum (e.g. "charge them £700 per day for 2 days"), create line items that reflect this pricing.

DRAFT SUMMARY MATERIALS:
- If the user instructions contain "USER-CONFIRMED PRICED MATERIALS", these are items the user has explicitly priced in the Quote Draft Summary.
- Create a line item for EACH of these with the EXACT quantity and price shown.
- If the user instructions contain "Materials (need pricing from catalog or estimate)", these items need pricing — check the catalog first, then estimate.

INSTALLATION LABOUR FROM MATERIALS:
- If materials include "[install: Xhrs/unit]", this means each unit requires X hours of labour to install.
- If materials include "[labour: £Y]", this is the pre-calculated total labour cost for that material line.
- ONLY when "[install: Xhrs/unit]" is present, create SEPARATE line items for supply and installation. For example:
  * "89 × Linear LED Light @ £19 [install: 2hrs/unit] [labour: £10680.00]" should produce TWO line items:
    1. "Supply Linear LED Light" — qty: 89, rate: £19, unit: each
    2. "Install Linear LED Light" — qty: 178 (89 × 2hrs), rate: £60/hr (use the Labour Rate), unit: hr
- If a material does NOT have "[install: Xhrs/unit]", create ONE combined "Supply and install" line item as normal. Do NOT estimate or invent installation times — only use times explicitly provided in the data.
- The Labour Rate from company settings should be used for all installation labour calculations.

PLANT / HIRE ITEMS:
- If the user provides a "PLANT / HIRE:" section, create separate line items for each piece of hired equipment.
- Use the SELL price (not cost price) as the rate on the quote. The cost price is internal only.
- Include the duration in the description, e.g. "Cherry Picker Hire (1 week)" or "Scaffold Tower Hire (3 days)".
- Apply the Plant Markup percentage to plant/hire items if specified in company defaults or user data.
- Do NOT invent plant/hire items — only include them if explicitly provided in the data.`;

        // Build company defaults context from organization profile
        let companyDefaultsContext = "";
        if (orgDefaults) {
          const parts: string[] = ["\n\nCOMPANY DEFAULTS — USE THESE VALUES (do NOT invent alternatives):"];
          parts.push(`Working Hours: ${orgDefaults.workingHours.start} to ${orgDefaults.workingHours.end}, ${orgDefaults.workingHours.days}`);
          if (orgDefaults.signatoryName) parts.push(`Signatory: ${orgDefaults.signatoryName}${orgDefaults.signatoryPosition ? `, ${orgDefaults.signatoryPosition}` : ""}`);
          if (orgDefaults.validityDays) parts.push(`Quote Validity: ${orgDefaults.validityDays} days from date of issue`);
          if (orgDefaults.insuranceLimits) {
            const ins = orgDefaults.insuranceLimits as any;
            if (ins.employers) parts.push(`Employers Liability Insurance: ${ins.employers} per incident`);
            if (ins.public) parts.push(`Public Liability Insurance: ${ins.public} per incident`);
            if (ins.professional) parts.push(`Professional Indemnity Insurance: ${ins.professional} per claim`);
          }
          if (orgDefaults.dayWorkRates) {
            const dw = orgDefaults.dayWorkRates as any;
            const dwParts: string[] = [];
            if (dw.labourRate) dwParts.push(`Labour: £${dw.labourRate}/hr`);
            if (dw.materialMarkup) dwParts.push(`Material: cost + ${dw.materialMarkup}%`);
            if (dw.plantMarkup) dwParts.push(`Plant: cost + ${dw.plantMarkup}%`);
            if (dwParts.length > 0) parts.push(`Work Rates: ${dwParts.join(", ")}`);
          }
          if (orgDefaults.surfaceTreatment) parts.push(`Surface Treatment: ${orgDefaults.surfaceTreatment}`);
          if (orgDefaults.returnVisitRate) parts.push(`Return Visit Rate: ${orgDefaults.returnVisitRate}`);
          if (orgDefaults.exclusions) {
            parts.push(`\nSTANDARD EXCLUSIONS — ALWAYS include these in the exclusions list:\n${orgDefaults.exclusions}`);
          }
          if (orgDefaults.paymentTerms) parts.push(`Payment Terms: ${orgDefaults.paymentTerms}`);
          companyDefaultsContext = parts.join("\n");
        }

        // BoQ Detection — scan evidence for Bill of Quantities patterns
        const allEvidence = processedEvidence.join("\n");
        const boqPatterns = [
          /bill\s+of\s+quantities/i,
          /trade\s+bill/i,
          /\bboq\b/i,
          /priced\s+schedule/i,
          /\bqty\b.*\bunit\b.*\brate\b/i,
          /\bdescription\b.*\bqty\b.*\bunit\b/i,
          /\bnr\b.*£?\s*0\.00/i, // Blank rate columns typical in BoQs
          /page\s+total\s+\d+\/\d+/i, // "Page Total 1/4/1" format
        ];
        const hasBoQ = boqPatterns.some(pattern => pattern.test(allEvidence));
        console.log(`[generateDraft] BoQ detected: ${hasBoQ}, catalog items: ${catalogItems.length}`);
        
        let boqContext = "";
        if (hasBoQ) {
          boqContext = `\n\nBILL OF QUANTITIES DETECTED — THESE INSTRUCTIONS OVERRIDE ALL OTHER FORMATTING RULES:
The tender documents contain a Bill of Quantities (BoQ) or Trade Bill. You MUST follow these rules EXACTLY:

QUANTITIES — THIS IS THE MOST IMPORTANT RULE:
- Read the QTY column from the BoQ for EVERY line item. The quantities are numbers like 1, 2, 4, 5, 6, 10 etc.
- You MUST use the EXACT quantity from the QTY column — do NOT default to 1
- Example: if the BoQ says "Universal Beam 203x133x30 - 2.50m long | Qty: 5 | nr" then quantity MUST be 5, not 1
- Example: if the BoQ says "Universal Beam 203x133x30 - 5.50m long | Qty: 10 | nr" then quantity MUST be 10, not 1
- If a quantity column shows a number, USE THAT NUMBER

LINE ITEMS — KEEP EVERY ITEM SEPARATE:
- Extract EVERY line item from the BoQ as a SEPARATE line item in your output
- Do NOT merge or combine items that appear on different rows, even if they have similar descriptions
- Items from different SITES must remain separate (e.g. Haseldine Meadows items and Lockley Crescent items are separate even if the beam size is the same)
- If the BoQ has "5.50m long" under Haseldine Meadows with qty 10, AND "5.50m long" under Lockley Crescent with qty 1, these are TWO separate line items
- Include the site name in each description to distinguish them (e.g. "Haseldine Meadows - UB 203x133x30 - 5.50m" and "Lockley Crescent - UB 203x133x30 - 5.50m")

RATES:
- Match each BoQ item to the company catalog and use catalog rates
- If no catalog rate exists, provide a realistic UK market rate
- The total for each line = quantity × rate

STRUCTURE:
- The output line items must map 1:1 to the BoQ rows
- Do NOT add extra items for "project management", "design review", "handover", "completion" etc.
- Do NOT create multi-phase structures — just price the bill items
- If the BoQ is grouped by site or section, use the site/section name as a prefix in the description`;
        }

        // Determine if this is a comprehensive quote
        const isComprehensive = (quote as any).quoteMode === "comprehensive";
        const tradePresetKey = (quote as any).tradePreset as string | null;
        const tradePreset = tradePresetKey && tradePresetKey in TRADE_PRESETS
          ? TRADE_PRESETS[tradePresetKey as keyof typeof TRADE_PRESETS]
          : null;

        // Build trade-specific prompt additions for comprehensive mode
        let tradePromptAdditions = "";
        if (isComprehensive && tradePreset) {
          tradePromptAdditions = `\n\nTRADE-SPECIFIC GUIDANCE:\n- Line Item Extraction: ${tradePreset.aiPrompts.lineItemExtraction}\n- Timeline Analysis: ${tradePreset.aiPrompts.timelineAnalysis}`;
        }

        // Trade-relevance guardrail — prevents generating nonsense quotes for unrelated content
        const userTradeSectorForGuardrail = ctx.user.defaultTradeSector || null;
        const tradeLabel = tradePresetKey || userTradeSectorForGuardrail || "general trades/construction";
        const tradeRelevanceGuardrail = `\n\nTRADE RELEVANCE CHECK — IMPORTANT:
This quote is for a business in the "${tradeLabel}" trade. Before generating the quote, assess whether the evidence provided is genuinely related to ${tradeLabel} work.

If the evidence is clearly UNRELATED to ${tradeLabel} (e.g. someone asking for food items, random products, joke requests, or work that belongs to an entirely different trade):
- Set the "title" field to "⚠️ Content Review Needed"
- Set the "description" field to a polite message explaining: "The content provided doesn't appear to relate to ${tradeLabel} work. Please check your input and try again. If this was intentional, add more detail about how this relates to your ${tradeLabel} business."
- Set "lineItems" to an empty array []
- Set "assumptions" to ["The evidence provided did not appear to relate to ${tradeLabel} work"]
- Set "exclusions" to an empty array []
- Still extract clientName if mentioned

If the evidence IS related to ${tradeLabel} (even loosely — e.g. buying materials for a job, hiring subcontractors, quoting for maintenance), proceed normally with the full quote generation.

When in doubt, generate the quote but add a note in the assumptions: "Some items may not be directly related to ${tradeLabel} — please review."
`;

        // Build the system prompt based on quote mode
        let systemPrompt: string;

        if (isComprehensive) {
          // When a BoQ is detected, modify the comprehensive prompt to price individual items
          // instead of creating generic lump-sum phases
          const lineItemInstructions = hasBoQ ? `
  "lineItems": [
    {
      "description": "string - MUST be the exact item description from the BoQ/Trade Bill, prefixed with the site name (e.g. 'Haseldine Meadows - Universal Beam 203x133x30 - 5.50m long')",
      "quantity": "number - MUST be the exact quantity from the BoQ Qty column. Read carefully: 1, 5, 10, 2, 4, 6 etc. Do NOT default to 1.",
      "unit": "string - from the BoQ (nr, m, m², tonnes, etc.)",
      "rate": "number - use catalog rate if available, otherwise estimate",
      "phase": "string - the site or section name from the BoQ (e.g. 'Haseldine Meadows - Frame' or 'Lockley Crescent - Frame')",
      "category": "string - the trade category (e.g. 'Structural Steelwork')"
    }
  ],` : `
  "lineItems": [
    {
      "description": "string - detailed description of the specific deliverable",
      "quantity": number,
      "unit": "string (each, hours, days, licences, per user, etc.)",
      "rate": number,
      "phase": "string - which project phase this belongs to (e.g., 'Phase 1: Discovery & Audit')",
      "category": "string - grouping category (e.g., 'Hardware', 'Professional Services', 'Software & Licensing')"
    }
  ],`;

          const lineItemRules = hasBoQ ? `
- A Bill of Quantities / Trade Bill has been detected. Your line items MUST be a 1:1 copy of the BoQ items with rates filled in.
- Do NOT create generic phase-based line items like "Haseldine Meadows structural steel frame - £75,000". Instead, list each individual beam/item from the BoQ.
- Do NOT invent line items for "project management", "design review", "quality assurance", "handover" etc. unless they appear in the BoQ.
- The timeline section should still have phases (fabrication, delivery, erection etc.) but the line items must match the BoQ exactly.
- Read the Qty column carefully — quantities like 5, 10, 4, 6 must be used exactly as stated.` : `
- Group line items by phase/category. Each phase should have multiple granular line items, not one lump sum.`;

          systemPrompt = `You are a senior consultant preparing a comprehensive multi-page proposal document. This is NOT a simple invoice - it is a detailed professional proposal that justifies the investment to the client.

You must produce a thorough, detailed proposal with ALL of the following sections populated. The output will be rendered as a multi-page PDF document.

Rules:
- Extract client details from the evidence. If the user has provided specific requirements, follow them precisely.
- Every line item must have a clear, specific description that a non-technical person can understand.
${lineItemRules}
- Rates must be realistic for the UK market.
- The description field is the EXECUTIVE SUMMARY - it must be 2-3 full paragraphs explaining the project scope, business case, and expected outcomes.
- The coverLetterContent is a formal introduction letter to the client.
- Timeline phases must be detailed with realistic durations, dependencies, and resource requirements.
- Include site requirements, quality/compliance standards, and technical review data relevant to the trade.
- Be thorough - if the user asks for a 5+ page document, generate enough content to fill it.
- Add security measures, best practices, and industry standards that strengthen the proposal.
- Do NOT use filler phrases like "We are pleased to" or "This comprehensive proposal". Write directly and professionally.

You MUST respond with valid JSON in this exact format:
{
  "clientName": "string or null",
  "clientEmail": "string or null",
  "clientPhone": "string or null",
  "clientAddress": "string or null",
  "title": "string - professional proposal title",
  "description": "string - EXECUTIVE SUMMARY: 2-3 full paragraphs. Paragraph 1: Project background and business case (why this work is needed, reference any incidents or risks). Paragraph 2: Scope overview covering all major workstreams. Paragraph 3: Expected outcomes and benefits to the client. Write in plain professional English. No bullet points in this field.",
  "coverLetterContent": "string - A formal cover letter (3-4 paragraphs) addressed to the client. Introduce your company, summarise the proposal, highlight key benefits, and include a call to action. Professional but not stuffy. IMPORTANT: Sign off with the signatory name and position from the COMPANY DEFAULTS provided. Never use placeholders like [Your Name] or [Your Position].",
${lineItemInstructions}
  "timeline": {
    "estimatedDuration": { "value": number, "unit": "days or weeks or months" },
    "phases": [
      {
        "name": "string - phase name",
        "description": "string - 2-4 sentences describing what happens in this phase, what the client should expect, and what will be delivered",
        "duration": { "value": number, "unit": "days or weeks" },
        "dependencies": ["string array - what must be completed or provided before this phase can start"],
        "resources": {
          "manpower": "string - e.g., '1 Senior Engineer, 1 Technician'",
          "equipment": ["string array of equipment needed"],
          "materials": ["string array of materials needed"]
        },
        "costBreakdown": {
          "labour": number,
          "materials": number,
          "equipment": number,
          "total": number
        },
        "riskFactors": ["string array of risks specific to this phase"],
        "deliverables": ["string array of what the client receives at end of this phase"]
      }
    ]
  },
  "siteRequirements": {
    "workingHours": { "start": "${orgDefaults?.workingHours?.start || '08:00'}", "end": "${orgDefaults?.workingHours?.end || '16:30'}", "days": "${orgDefaults?.workingHours?.days || 'Monday to Friday'}" },
    "accessRestrictions": ["string array"],
    "safetyRequirements": ["string array"],
    "parkingStorage": "string",
    "permitNeeds": ["string array"],
    "constraints": ["string array"]
  },
  "qualityCompliance": {
    "requiredStandards": ["string array - e.g., 'Cyber Essentials Plus', 'ISO 27001', 'GDPR'"],
    "certifications": [{ "name": "string", "required": true, "providedBy": "string" }],
    "inspectionPoints": [{ "phase": "string", "description": "string" }],
    "testingSchedule": [{ "test": "string", "timing": "string", "responsibility": "string" }]
  },
  "technicalReview": {
    "specialRequirements": ["string array of technical requirements and standards"],
    "inspectionRequirements": ["string array of inspection/audit points"],
    "checklist": [{ "item": "string", "status": "yes", "notes": "string" }]
  },
  "assumptions": ["string array of assumptions made - be thorough"],
  "exclusions": ["string array of what is NOT included - MUST include ALL standard exclusions from COMPANY DEFAULTS plus any project-specific exclusions"],
  "riskNotes": "string - internal notes about risks or concerns (not shown to client)",
  "terms": "string - payment terms, warranty, and conditions. Build from COMPANY DEFAULTS: include quote validity period, insurance limits, day work rates, working hours, return visit rate, payment terms, VAT status. Write as numbered clauses."
}

CRITICAL RULES:
- When the evidence contains specific quantities (e.g. "5 nr", "10 metres", "2.5 tonnes"), you MUST use those exact quantities. NEVER substitute your own estimates for quantities explicitly stated in the evidence.
- When a Bill of Quantities or Trade Bill is present, extract and price each item individually — do not lump items together or create generic phases.
- Use company catalog rates when items match. Only estimate rates for items with no catalog match.
- Use the company defaults provided below for working hours, insurance, exclusions, signatory details, etc. Do NOT invent these values.
${tradePromptAdditions}${boqContext}${companyDefaultsContext}${catalogContext}${priceHierarchyContext}${tradeRelevanceGuardrail}`;
        } else {
          systemPrompt = `You are a senior estimator preparing a quote from tender evidence. Extract facts from the documents provided and produce a structured draft.

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
  "title": "string - brief but descriptive title for the work",
  "description": "string - COMPREHENSIVE description (3-5 sentences minimum) that includes: 1) Project overview and scope, 2) Key deliverables being quoted, 3) Client objectives or goals mentioned, 4) Any phases or timeline if discussed. This appears on the quote PDF so make it professional and informative.",
  "lineItems": [
    {
      "description": "string - detailed description of the line item including site name if multiple sites",
      "quantity": "number - MUST match the exact quantity from the BoQ/evidence. Read the Qty column carefully. Do NOT default to 1.",
      "unit": "string (each, nr, sqm, hours, etc.)",
      "rate": "number - use catalog rate if available, otherwise estimate"
    }
  ],
  "assumptions": ["string array of assumptions made"],
  "exclusions": ["string array of what is NOT included - MUST include ALL standard exclusions from company defaults plus any project-specific exclusions"],
  "terms": "string - payment terms and conditions. Use the company defaults if provided. Include: quote validity period, payment terms, insurance limits, day work rates, return visit rates, working hours. Write as numbered clauses.",
  "riskNotes": "string - internal notes about risks or concerns",
  "symbolMappings": { "symbol": { "meaning": "string", "confirmed": false } }
}

IMPORTANT for description field:
- Write 3-5 sentences in plain professional English. No bullet points.
- State what the project involves and what the client will receive.
- Reference specific deliverables extracted from the evidence.
- Do not use phrases like "This comprehensive quote covers" or "We are pleased to offer".
- Write as if a tradesperson is explaining the scope to the client directly.

IMPORTANT for lineItems:
- The "quantity" field is a NUMBER not a string. Read it from the Qty column of the BoQ.
- If the BoQ says Qty=5, the quantity must be 5. If it says Qty=10, the quantity must be 10.
- NEVER default all quantities to 1. Each line item has its own quantity from the source document.
- Keep items from different sites as separate line items, even if the description is similar.

IMPORTANT for exclusions:
- ALWAYS include every item from the STANDARD EXCLUSIONS in company defaults.
- Add any additional project-specific exclusions on top.

IMPORTANT for terms:
- Build the terms from company defaults: include validity period, insurance limits, day work rates, working hours, return visit rate, payment terms, and VAT status.

Be thorough but realistic with pricing. Extract all client details mentioned. List specific line items with quantities. Note any assumptions you're making and things that are explicitly excluded.

CRITICAL RULES:
- When the evidence contains specific quantities (e.g. "5 nr", "10 metres"), you MUST use those exact quantities. NEVER substitute your own estimates.
- When a Bill of Quantities or Trade Bill is present, extract and price each item individually.
- Use company catalog rates when items match. Only estimate rates for items with no catalog match.
- Use the company defaults below for working hours, insurance, exclusions, etc. Do NOT invent these values.
${boqContext}${companyDefaultsContext}${catalogContext}${priceHierarchyContext}${tradeRelevanceGuardrail}`;
        }

        // Generate draft using LLM
        const response = await invokeLLM({
          messages: [
            {
              role: "system",
              content: systemPrompt,
            },
            {
              role: "user",
              content: `Please analyze the following evidence and generate a ${isComprehensive ? "comprehensive multi-page proposal" : "quote draft"}:\n\n${processedEvidence.join("\n\n")}`,
            },
          ],
          response_format: { type: "json_object" },
        });

        const content = response.choices[0]?.message?.content;
        const responseText = typeof content === "string" ? content : "";

        try {
          const draft = JSON.parse(responseText);

          // Update quote with extracted client details and description
          const quoteUpdateData: Partial<InsertQuote> = {
            clientName: draft.clientName || quote.clientName,
            clientEmail: draft.clientEmail || quote.clientEmail,
            clientPhone: draft.clientPhone || quote.clientPhone,
            clientAddress: draft.clientAddress || quote.clientAddress,
            title: draft.title || quote.title,
            description: draft.description || quote.description,
          };

          // Save the user's instruction text so it persists across page loads
          if (input.userPrompt !== undefined) {
            (quoteUpdateData as any).userPrompt = input.userPrompt || null;
          }

          // Save AI-generated terms (works for both simple and comprehensive)
          if (draft.terms) {
            quoteUpdateData.terms = draft.terms;
          }

          // For comprehensive quotes, populate the comprehensiveConfig with AI-generated data
          if (isComprehensive) {
            const existingConfig = ((quote as any).comprehensiveConfig || {}) as ComprehensiveConfig;
            const updatedConfig: ComprehensiveConfig = {
              ...existingConfig,
              sections: {
                ...existingConfig.sections,
                coverLetter: {
                  ...existingConfig.sections?.coverLetter,
                  enabled: true,
                  content: draft.coverLetterContent || existingConfig.sections?.coverLetter?.content,
                },
                siteRequirements: {
                  ...existingConfig.sections?.siteRequirements,
                  enabled: true,
                  data: draft.siteRequirements || existingConfig.sections?.siteRequirements?.data,
                },
                qualityCompliance: {
                  ...existingConfig.sections?.qualityCompliance,
                  enabled: true,
                  data: draft.qualityCompliance || existingConfig.sections?.qualityCompliance?.data,
                },
                technicalReview: {
                  ...existingConfig.sections?.technicalReview,
                  enabled: true,
                  data: draft.technicalReview || existingConfig.sections?.technicalReview?.data,
                },
              },
              timeline: draft.timeline ? {
                enabled: true,
                estimatedDuration: draft.timeline.estimatedDuration,
                phases: draft.timeline.phases?.map((p: any, idx: number) => ({
                  id: `phase-${idx + 1}`,
                  name: p.name,
                  description: p.description,
                  duration: p.duration,
                  dependencies: p.dependencies,
                  resources: p.resources,
                  costBreakdown: p.costBreakdown,
                  riskFactors: p.riskFactors,
                  deliverables: p.deliverables,
                  status: "pending" as const,
                })),
              } : existingConfig.timeline,
            };
            quoteUpdateData.comprehensiveConfig = updatedConfig as any;
            if (draft.terms) {
              quoteUpdateData.terms = draft.terms;
            }
          }

          const updatedQuote = await updateQuote(input.quoteId, ctx.user.id, quoteUpdateData);

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
                phaseId: isComprehensive && item.phase ? item.phase : undefined,
                category: isComprehensive && item.category ? item.category : undefined,
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
