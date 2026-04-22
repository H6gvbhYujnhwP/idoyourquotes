import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { invokeLLM } from "./_core/llm";
import { subscriptionRouter } from "./services/subscriptionRouter";
import { adminRouter } from "./services/adminRouter";
import { canCreateQuote, canUseAIFeatures, getUpgradeSuggestion, TIER_CONFIG, type SubscriptionTier } from "./services/stripe";
import { sendLimitWarningEmail } from "./services/emailService";
import { uploadToR2, getPresignedUrl, deleteFromR2, isR2Configured, getFileBuffer } from "./r2Storage";
import { analyzePdfWithClaude, analyzePdfWithOpenAI, analyzeImageWithClaude, isClaudeConfigured, invokeClaude } from "./_core/claude";
import { isOpenAIConfigured } from "./_core/openai";
import { extractUrls, scrapeUrls, formatScrapedContentForAI } from "./_core/webScraper";
import { extractBrandColors } from "./services/colorExtractor";
import { parseWordDocument, isWordDocument } from "./services/wordParser";
import { performElectricalTakeoff, applyUserAnswers, formatTakeoffForQuoteContext, SYMBOL_STYLES, SYMBOL_DESCRIPTIONS, extractWithPdfJs, extractPdfLineColours, classifyElectricalPDF, extractWithPdfParse } from "./services/electricalTakeoff";
import { performContainmentTakeoff, calculateCableSummary, generateContainmentSvgOverlay, isContainmentDrawing, formatContainmentForQuoteContext, TRAY_SIZE_COLOURS, WHOLESALER_LENGTH_METRES } from "./services/containmentTakeoff";
import { generateSvgOverlay } from "./services/takeoffMarkup";
import { createElectricalTakeoff, getElectricalTakeoffsByQuoteId, getElectricalTakeoffById, getElectricalTakeoffByInputId, updateElectricalTakeoff, deleteElectricalTakeoffByInputId } from "./db";
import { createContainmentTakeoff, getContainmentTakeoffsByQuoteId, getContainmentTakeoffById, getContainmentTakeoffByInputId, updateContainmentTakeoff, deleteContainmentTakeoffByInputId, updateInputMimeType } from "./db";
import { parseSpreadsheet, isSpreadsheet, formatSpreadsheetForAI } from "./services/excelParser";
import { generateQuoteHTML } from "./pdfGenerator";
import { getCatalogSeedForSector } from "./catalogSeeds";
import { getDemoQuoteForSector } from "./demoQuotes";
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
  seedCatalogFromSectorTemplate,
  seedDemoQuoteForSector,
  recalculateQuoteTotals,
  updateUserProfile,
  changePassword,
  getUserPrimaryOrg,
  getOrganizationById,
  updateOrganization,
  logUsage,
} from "./db";
import { transcribeAudio, transcribeAudioFromBuffer } from "./_core/voiceTranscription";
import { TRADE_PRESETS, TradePresetKey } from "./tradePresets";
import { selectEngine } from "./engines/engineRouter";
import type { EngineInput } from "./engines/types";
import { generateElectricalLineItems } from "./engines/electricalEngine";
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

/**
 * Gate AI features by subscription status.
 * Throws if the user's org is cancelled, unpaid, or trial-expired.
 * Does NOT block past_due (grace period) or cancelAtPeriodEnd (paid through end of period).
 * Manual edits (quotes.update, lineItems.update, generatePDF) are NOT gated — they cost nothing.
 */
async function assertAIAccess(userId: number): Promise<void> {
  const org = await getUserPrimaryOrg(userId);
  if (!org) return; // No org = legacy user, allow through
  const check = canUseAIFeatures(org as any);
  if (!check.allowed) {
    throw new Error(check.reason || 'AI features are not available on your current plan.');
  }
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
          defaultVatRate: z.number().optional(),
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
          if (defaultDayWorkRates !== undefined) {
            // Merge into existing blob to preserve _emailFlags and other internal fields
            const existingRates = ((org as any)?.defaultDayWorkRates || {}) as Record<string, any>;
            orgUpdate.defaultDayWorkRates = { ...existingRates, ...defaultDayWorkRates };
          }
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

        // Upload to R2 with user-specific folder.
        // Returns a permanent proxy URL (/api/file/{key}) — never expires.
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
            // Also clear the limit email flags so they can fire again next period
            const dayWorkRates = ((org as any).defaultDayWorkRates || {}) as Record<string, any>;
            const emailFlags = { ...(dayWorkRates._emailFlags || {}) };
            delete emailFlags.limitApproachingSent;
            delete emailFlags.limitReachedSent;
            const updatedRates = { ...dayWorkRates, _emailFlags: emailFlags };
            await updateOrganization(org.id, { monthlyQuoteCount: 0, quoteCountResetAt: new Date(), defaultDayWorkRates: updatedRates } as any);
          }
        }

        // Pre-populate taxRate from org default VAT rate if not explicitly provided
        const orgDefaultVatRate = (org as any)?.defaultDayWorkRates?.defaultVatRate;
        const taxRateToUse = input?.taxRate !== undefined
          ? input.taxRate
          : orgDefaultVatRate !== undefined
            ? String(orgDefaultVatRate)
            : undefined;

        const quote = await createQuote({
          userId: ctx.user.id,
          orgId: org?.id,
          ...input,
          taxRate: taxRateToUse,
          terms,
          quoteMode: quoteMode as "simple" | "comprehensive",
          tradePreset: tradePreset || undefined,
          comprehensiveConfig: comprehensiveConfig as any,
        });

        // ── Increment monthly quote count ──
        if (org) {
          const currentCount = ((org as any).monthlyQuoteCount ?? 0) + 1;
          await updateOrganization(org.id, { monthlyQuoteCount: currentCount } as any);

          // Send limit warning email at 80% or 100% of quota (once per billing period)
          const max = (org as any).maxQuotesPerMonth ?? 10;
          if (max > 0 && max !== -1) {
            const pct = Math.round((currentCount / max) * 100);
            if (pct >= 80) {
              // Check if we've already sent this email this billing period
              const dayWorkRates = ((org as any).defaultDayWorkRates || {}) as Record<string, any>;
              const emailFlags = dayWorkRates._emailFlags || {};
              const isHardLimit = pct >= 100;
              const flagKey = isHardLimit ? 'limitReachedSent' : 'limitApproachingSent';

              if (!emailFlags[flagKey]) {
                const tier = (org as any).subscriptionTier as SubscriptionTier || 'trial';
                const suggestion = getUpgradeSuggestion(tier, 'quotes');
                sendLimitWarningEmail({
                  to: (org as any).billingEmail || ctx.user.email,
                  name: ctx.user.name || undefined,
                  limitType: 'quotes',
                  currentUsage: currentCount,
                  maxAllowed: max,
                  currentTierName: TIER_CONFIG[tier]?.name || tier,
                  suggestedTierName: suggestion?.tierName,
                  suggestedTierPrice: suggestion?.price,
                  newLimit: suggestion?.newLimit,
                  isHardLimit,
                }).then(() => {
                  // Mark flag so we don't send again this billing period
                  const updatedFlags = { ...emailFlags, [flagKey]: new Date().toISOString() };
                  const updatedRates = { ...dayWorkRates, _emailFlags: updatedFlags };
                  updateOrganization(org.id, { defaultDayWorkRates: updatedRates } as any)
                    .catch(err => console.error('[QuoteCreate] Failed to save limit email flag:', err));
                }).catch(err => console.error('[QuoteCreate] Failed to send limit email:', err));
              }
            }
          }
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
        qdsSummaryJson: z.string().nullable().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        // Beta-2 Chunk 2b-ii: qdsSummaryJson column has been dropped from
        // the quotes table. The zod input still accepts the field so that
        // legacy callers that haven't been updated yet continue to type-
        // check and send without error — we silently discard it on write.
        const { id, qdsSummaryJson: _discarded, ...data } = input;
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
        await assertAIAccess(ctx.user.id);
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
        await assertAIAccess(ctx.user.id);
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
        await assertAIAccess(ctx.user.id);
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
        status: z.enum(["draft", "sent", "accepted", "declined", "pdf_generated"]),
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
        // Beta-1: "pdf_generated" is a new terminal-ish state added after the
        // unified workspace's Generate PDF action. A quote can move draft →
        // pdf_generated when the PDF download succeeds, and from there to any
        // of sent / accepted / declined / draft. The other states can also
        // move directly into pdf_generated for users who regenerate a PDF
        // after sending/winning/losing.
        const validTransitions: Record<string, string[]> = {
          draft: ["sent", "pdf_generated"],
          sent: ["accepted", "declined", "draft", "pdf_generated"],
          accepted: ["draft", "pdf_generated"],
          declined: ["draft", "pdf_generated"],
          pdf_generated: ["sent", "accepted", "declined", "draft"],
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

          const html = await generateQuoteHTML({ quote, lineItems, user, organization: org, tenderContext });
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
        await assertAIAccess(ctx.user.id);
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
        // Use first name only for the greeting — "Hi John," not "Hi John Smith,"
        const greetingName = contactNameForEmail.trim().split(/\s+/)[0] || contactNameForEmail;
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

IMPORTANT: Address the email greeting using the first name only (e.g. "Hi ${greetingName},"), NOT the full name or company name.`,
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

    // ── seedDemoForSector ──────────────────────────────────────────────────
    // Seed an "(Example)" demo quote for the user's sector. Fires from the
    // Dashboard nudge card "Load Example Quote" button. Mirrors the
    // catalog.seedFromSectorTemplate pattern — organisation lookup, sector
    // validation, delegate to the db.ts helper.
    //
    // Idempotent: if an "(Example)" quote already exists for this org with
    // matching tradePreset, seedDemoQuoteForSector returns that quoteId
    // without creating a duplicate. The client redirects to the returned
    // quoteId either way, so repeated clicks are safe and predictable.
    //
    // Quota: does NOT go through quotes.create, so does NOT increment
    // monthlyQuoteCount. This is deliberate — demo quotes are an
    // onboarding aid, not billable work, and must not count against the
    // user's monthly quote allowance (same rationale as the catalog
    // auto-seed path bypassing catalog-cap checks on registration).
    seedDemoForSector: protectedProcedure
      .mutation(async ({ ctx }) => {
        const org = await getUserPrimaryOrg(ctx.user.id);
        if (!org) {
          throw new Error("No organization found for user");
        }

        const sector = ctx.user.defaultTradeSector;
        if (!sector) {
          throw new Error(
            "No default trade sector set. Set one in Settings first, then load the example quote."
          );
        }

        const factory = getDemoQuoteForSector(sector);
        if (!factory) {
          throw new Error(
            `No example quote template exists yet for sector "${sector}". This feature is currently available for: IT Services, Website & Digital Marketing, Commercial Cleaning, Pest Control.`
          );
        }

        const result = await seedDemoQuoteForSector(org.id, ctx.user.id, sector);
        return result;
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
        pricingType: z.enum(['standard', 'monthly', 'optional', 'annual']).optional(),
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
          pricingType: input.pricingType || "standard",
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
        pricingType: z.enum(['standard', 'monthly', 'optional', 'annual']).optional(),
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

        // Delete associated takeoff records before deleting the input
        try { await deleteElectricalTakeoffByInputId(input.id); } catch {}
        try { await deleteContainmentTakeoffByInputId(input.id); } catch {}

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
        await assertAIAccess(ctx.user.id);
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
                  `Transcribe this document for a quoting system. Your job is VERBATIM TRANSCRIPTION — not analysis, not summarisation, not interpretation.

Rules:
1. Reproduce every visible row, bullet, checkbox line, table cell, and list item as a separate line of output. Do NOT roll repeated rows into a count (if the document has 14 identical-looking rows for the same product, write the line out 14 times — do not shortcut to "14 × [item]").
2. Write every named identifier out in full: every domain name (e.g. fabricflare.co.uk), email address, phone number, account number, product model, subscription variant, hire agreement reference, service plan, and tier name. Never paraphrase ("various domains") or group ("multiple M365 licences") — list each instance.
3. Preserve the document's own wording, column headings, and section titles. Use the terminology on the page. Do NOT invent headings like "Document Overview", "Key Details for Quoting", or "Items Listed" — those encourage summarising.
4. Include every number exactly as written — prices, quantities, dimensions, model codes, reference numbers, dates.
5. Where text is arranged in a table, output one logical row per line with column values separated by " | ".
6. Where text is arranged under a heading, keep the heading and the items beneath it together in the same reading order.
7. If an item appears inside a checkbox, tick box, or radio selector, include it — the checkbox state is irrelevant, the item name and any accompanying identifier are what matter.
8. Ignore page headers/footers that repeat on every page (page numbers, corporate banners) — list them once at most.

Output the text of the document laid out as close to the original reading order as possible, with every discrete item on its own line. No preamble, no trailing summary, no explanatory notes from you.`,
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
              // Skip if this PDF is marked as reference-only (legend sheet) — it has no installation counts.
              //
              // Sector gate: only run auto-takeoff when the quote's tradePreset is
              // "electrical". Without this gate, PDFs uploaded on IT / cleaning /
              // website / pest quotes have their processedContent (real PDF text
              // from OpenAI extraction) overwritten by the electrical takeoff
              // stub further down this block, which breaks Generate Quote for
              // the four sectors. Explicit allow-list — any new sector added in
              // future will safely not run electrical processing by default.
              const isElectricalQuote = (quote as any).tradePreset === "electrical";
              if (input.inputType === "pdf" && !inputRecord.mimeType?.includes(";reference=true") && isElectricalQuote) {
                try {
                  // Check if a takeoff already exists for this input (avoid duplicates)
                  const existingTakeoff = await getElectricalTakeoffByInputId(inputRecord.id);
                  if (!existingTakeoff) {
                    console.log(`[Auto-takeoff] Running electrical takeoff for input ${inputRecord.id}`);
                    const pdfBuf = await getFileBuffer(key);

                    // ── Phase 23: Classify PDF before running takeoff ──────────────────
                    // Determines whether this PDF is a floor plan (run takeoff) or a
                    // reference document (equipment schedule, DB schedule, riser, spec,
                    // legend) that should be marked reference-only and skipped.
                    // Pure text analysis — no AI call. Fast and deterministic.
                    // Falls back to floor_plan if confidence is low (safe default).
                    let classifiedDocType = 'floor_plan';
                    try {
                      const { text: classText, pages: classPages } = await extractWithPdfParse(pdfBuf);
                      const classification = classifyElectricalPDF(classText, classPages);
                      classifiedDocType = classification.type;
                      console.log(`[Auto-classify] ${input.filename ?? 'Unknown'}: ${classification.type} (confidence ${(classification.confidence * 100).toFixed(0)}%)`);

                      if (classification.type !== 'floor_plan') {
                        // Auto-set reference-only with docType encoding in mimeType.
                        // Encoding: application/pdf;reference=true;docType=<type>
                        // The frontend reads ;docType= to show the correct badge and
                        // separate reference docs from floor plans in all filtered arrays.
                        const baseMime = (inputRecord.mimeType || 'application/pdf')
                          .replace(/;reference=true/g, '')
                          .replace(/;docType=[^;]*/g, '')
                          .trim();
                        await updateInputMimeType(inputRecord.id, `${baseMime};reference=true;docType=${classification.type}`);
                        // processedContent was already written above from the OpenAI extraction
                        // path — it contains the raw text of the document, which is the right
                        // AI context for schedules/specs. Do not overwrite it here.
                        console.log(`[Auto-classify] ${input.filename ?? 'Unknown'}: set reference-only (${classification.type}), skipping takeoff`);
                      }
                    } catch (classErr: any) {
                      // Non-fatal — if classification fails, proceed with takeoff as floor plan
                      console.warn(`[Auto-classify] Classification failed (non-fatal):`, classErr.message);
                    }

                    if (classifiedDocType === 'floor_plan') {
                    // Fetch any legend symbolMap already saved for this quote
                    const autoTenderCtx = await getTenderContextByQuoteId(input.quoteId);
                    const autoSymbolMap: Record<string, string> = {};
                    if (autoTenderCtx?.symbolMappings) {
                      for (const [k, v] of Object.entries(autoTenderCtx.symbolMappings)) {
                        autoSymbolMap[k] = (v as any).meaning || '';
                      }
                    }

                    const takeoffResult = await performElectricalTakeoff(pdfBuf, input.filename || 'Unknown', autoSymbolMap);
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
                      processedContent: formatTakeoffForQuoteContext(takeoffResult, autoSymbolMap),
                      processingStatus: "completed",
                    });

                    // Save embedded legend symbols to tenderContext.symbolMappings so the frontend
                    // can resolve descriptions for all detected codes, not just hardcoded defaults.
                    // Merges with any existing symbolMappings (e.g. from a separately uploaded legend).
                    if (takeoffResult.embeddedLegendSymbols && Object.keys(takeoffResult.embeddedLegendSymbols).length > 0) {
                      const existingCtx = await getTenderContextByQuoteId(input.quoteId);
                      const existing = (existingCtx?.symbolMappings as Record<string, {meaning: string; confirmed: boolean}> | null) ?? {};
                      const merged: Record<string, {meaning: string; confirmed: boolean}> = { ...existing };
                      for (const [k, v] of Object.entries(takeoffResult.embeddedLegendSymbols)) {
                        if (!merged[k]) merged[k] = { meaning: v, confirmed: false };
                      }
                      await upsertTenderContext(input.quoteId, { symbolMappings: merged });
                      console.log(`[Auto-takeoff] Saved ${Object.keys(takeoffResult.embeddedLegendSymbols).length} embedded legend symbols to tenderContext`);
                    }

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
                          trayFilter: "all", trayDuty: "medium",
                          extraDropPerFitting: 2.0, firstPointRunLength: 15.0,
                          numberOfCircuits: 0, additionalCablePercent: 10,
                          wholesalerLengthMetres: 3,
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
                    } // end if (classifiedDocType === 'floor_plan')
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
        await assertAIAccess(ctx.user.id);
        const quote = await getQuoteWithOrgAccess(input.quoteId, ctx.user.id);
        if (!quote) throw new Error("Quote not found");

        const inputRecord = await getInputById(input.inputId);
        if (!inputRecord || inputRecord.quoteId !== input.quoteId) {
          throw new Error("Input not found");
        }

        if (inputRecord.inputType !== "audio") {
          throw new Error("Input is not an audio file");
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
          // Fetch audio buffer directly from R2 — fileUrl is now a proxy URL that
          // external services cannot reach, so we always go via getFileBuffer here.
          const audioBuffer = await getFileBuffer(inputRecord.fileKey);
          const mimeType = inputRecord.mimeType || "audio/mpeg";
          const result = await transcribeAudioFromBuffer(audioBuffer, mimeType);
          
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
        await assertAIAccess(ctx.user.id);
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
            `Transcribe this document for a quoting system. Your job is VERBATIM TRANSCRIPTION — not analysis, not summarisation, not interpretation.

Rules:
1. Reproduce every visible row, bullet, checkbox line, table cell, and list item as a separate line of output. Do NOT roll repeated rows into a count (if the document has 14 identical-looking rows for the same product, write the line out 14 times — do not shortcut to "14 × [item]").
2. Write every named identifier out in full: every domain name (e.g. fabricflare.co.uk), email address, phone number, account number, product model, subscription variant, hire agreement reference, service plan, and tier name. Never paraphrase ("various domains") or group ("multiple M365 licences") — list each instance.
3. Preserve the document's own wording, column headings, and section titles. Use the terminology on the page. Do NOT invent headings like "Document Overview", "Key Details for Quoting", or "Items Listed" — those encourage summarising.
4. Include every number exactly as written — prices, quantities, dimensions, model codes, reference numbers, dates.
5. Where text is arranged in a table, output one logical row per line with column values separated by " | ".
6. Where text is arranged under a heading, keep the heading and the items beneath it together in the same reading order.
7. If an item appears inside a checkbox, tick box, or radio selector, include it — the checkbox state is irrelevant, the item name and any accompanying identifier are what matter.
8. Ignore page headers/footers that repeat on every page (page numbers, corporate banners) — list them once at most.

Output the text of the document laid out as close to the original reading order as possible, with every discrete item on its own line. No preamble, no trailing summary, no explanatory notes from you.`,
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
        await assertAIAccess(ctx.user.id);
        const quote = await getQuoteWithOrgAccess(input.quoteId, ctx.user.id);
        if (!quote) throw new Error("Quote not found");

        const inputRecord = await getInputById(input.inputId);
        if (!inputRecord || inputRecord.quoteId !== input.quoteId) {
          throw new Error("Input not found");
        }

        if (inputRecord.inputType !== "image") {
          throw new Error("Input is not an image file");
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
          // Fetch image buffer directly from R2 and encode as base64.
          // fileUrl is now a proxy URL — OpenAI Vision cannot reach it,
          // so we always send the image inline as base64.
          const imageBuffer = await getFileBuffer(inputRecord.fileKey);
          const mimeType = (inputRecord.mimeType || "image/jpeg") as string;
          const base64Image = imageBuffer.toString("base64");

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
                      url: `data:${mimeType};base64,${base64Image}`,
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

    // Toggle reference-only flag on a PDF input (legend/key sheets)
    // When marked as reference-only:
    //   1. mimeType gets ;reference=true suffix
    //   2. Existing takeoffs deleted (they had legend symbol counts, not installation counts)
    //   3. parseLegend runs — extracts symbol→description pairs into tenderContexts.symbolMappings
    //   4. All other drawing PDFs for this quote are re-run with the new symbolMap
    // When unmarked:
    //   1. ;reference=true removed from mimeType
    //   2. tenderContexts.symbolMappings cleared (symbol source is gone)
    //   3. All drawing takeoffs re-run without symbolMap (unknowns will resurface as questions)
    setReferenceOnly: protectedProcedure
      .input(z.object({
        inputId: z.number(),
        quoteId: z.number(),
        isReference: z.boolean(),
      }))
      .mutation(async ({ ctx, input }) => {
        const quote = await getQuoteWithOrgAccess(input.quoteId, ctx.user.id);
        if (!quote) throw new Error("Quote not found");

        const inputRecord = await getInputById(input.inputId);
        if (!inputRecord) throw new Error("Input not found");
        if (inputRecord.quoteId !== input.quoteId) throw new Error("Input does not belong to this quote");
        if (inputRecord.inputType !== "pdf") throw new Error("Reference-only flag can only be set on PDF inputs");

        // Build the new mimeType
        const baseMimeType = (inputRecord.mimeType || "application/pdf").replace(/;reference=true/g, "").trim();
        const newMimeType = input.isReference ? `${baseMimeType};reference=true` : baseMimeType;
        await updateInputMimeType(input.inputId, newMimeType);

        if (input.isReference) {
          // Delete any symbol counts from this input (they're legend reference counts, not installations)
          await deleteElectricalTakeoffByInputId(input.inputId);
          await deleteContainmentTakeoffByInputId(input.inputId);
          console.log(`[setReferenceOnly] Deleted takeoffs for legend input ${input.inputId}`);

          // --- parseLegend: extract symbol→description pairs ---
          let symbolMap: Record<string, string> = {};
          try {
            if (!inputRecord.fileKey) throw new Error("No file key");
            const pdfBuf = await getFileBuffer(inputRecord.fileKey);
            const extracted = await extractWithPdfJs(pdfBuf);
            const legendText = extracted.words.map((w: any) => w.text).join(' ');

            // Call LLM to extract symbol mappings from the legend text
            const legendResponse = await invokeLLM({
              messages: [
                {
                  role: "system",
                  content: `You are an electrical drawing expert. Extract ALL symbol codes and their descriptions from this electrical legend/key sheet text.
Return ONLY a valid JSON object in this exact format (no markdown, no preamble):
{"CODE": "Description", "CODE2": "Description2"}
Rules:
- Symbol codes are typically 1-8 uppercase alphanumeric characters (e.g. J, JE, SO, WP, SPD, EXIT1)
- Include every code-description pair you can find
- If unsure whether something is a symbol, include it
- Return {} if no symbols found`
                },
                {
                  role: "user",
                  content: `Legend sheet text:\n\n${legendText.substring(0, 4000)}`
                }
              ],
              response_format: { type: "json_object" },
            });

            const content = legendResponse.choices[0]?.message?.content || '{}';
            const parsed = JSON.parse(content.replace(/```json|```/g, '').trim());
            // Validate: only keep string values, skip noise
            for (const [k, v] of Object.entries(parsed)) {
              if (typeof k === 'string' && typeof v === 'string' && k.length <= 10 && (v as string).length > 1) {
                symbolMap[k.toUpperCase()] = v as string;
              }
            }
            console.log(`[parseLegend] Extracted ${Object.keys(symbolMap).length} symbols from legend ${input.inputId}: ${Object.keys(symbolMap).join(', ')}`);
          } catch (legendErr: any) {
            console.warn(`[parseLegend] Legend extraction failed (non-fatal): ${legendErr.message}`);
          }

          // Save symbolMap to tenderContexts for this quote
          const symbolMappings = Object.fromEntries(
            Object.entries(symbolMap).map(([k, v]) => [k, { meaning: v, confirmed: false }])
          );
          await upsertTenderContext(input.quoteId, { symbolMappings });

          // Mark processedContent as legend reference (not used in QDS)
          await updateInputProcessing(input.inputId, {
            processedContent: `[LEGEND/KEY SHEET — ${Object.keys(symbolMap).length} symbol definitions extracted: ${Object.keys(symbolMap).join(', ')}. Not counted as installations.]`,
            processingStatus: "completed",
          });

          // Re-run electrical takeoffs on all OTHER drawing PDFs for this quote with the new symbolMap
          const allInputs = await getInputsByQuoteId(input.quoteId);
          const drawingInputs = allInputs.filter((inp: any) =>
            inp.inputType === 'pdf' &&
            inp.id !== input.inputId &&
            !inp.mimeType?.includes(';reference=true') &&
            inp.fileKey
          );
          for (const drawingInput of drawingInputs) {
            try {
              const pdfBuf = await getFileBuffer(drawingInput.fileKey!);
              const takeoffResult = await performElectricalTakeoff(pdfBuf, drawingInput.filename || 'Unknown', symbolMap);
              const svgOverlay = generateSvgOverlay(takeoffResult);
              // Upsert — delete existing then create fresh
              await deleteElectricalTakeoffByInputId(drawingInput.id);
              await createElectricalTakeoff({
                quoteId: input.quoteId,
                inputId: drawingInput.id,
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
              await updateInputProcessing(drawingInput.id, {
                processedContent: formatTakeoffForQuoteContext(takeoffResult, symbolMap),
                processingStatus: "completed",
              });
              console.log(`[setReferenceOnly] Re-ran takeoff for drawing ${drawingInput.id} with legend symbolMap`);
            } catch (rerunErr: any) {
              console.warn(`[setReferenceOnly] Re-run failed for input ${drawingInput.id} (non-fatal): ${rerunErr.message}`);
            }
          }

        } else {
          // Unmarking as reference — clear the symbolMappings and re-run without them
          await upsertTenderContext(input.quoteId, { symbolMappings: null });
          console.log(`[setReferenceOnly] Cleared symbolMappings for quote ${input.quoteId}`);

          // Re-run all drawing takeoffs without symbolMap (unknowns will surface as questions)
          const allInputs = await getInputsByQuoteId(input.quoteId);
          const drawingInputs = allInputs.filter((inp: any) =>
            inp.inputType === 'pdf' &&
            inp.id !== input.inputId &&
            !inp.mimeType?.includes(';reference=true') &&
            inp.fileKey
          );
          for (const drawingInput of drawingInputs) {
            try {
              const pdfBuf = await getFileBuffer(drawingInput.fileKey!);
              const takeoffResult = await performElectricalTakeoff(pdfBuf, drawingInput.filename || 'Unknown', {});
              const svgOverlay = generateSvgOverlay(takeoffResult);
              await deleteElectricalTakeoffByInputId(drawingInput.id);
              await createElectricalTakeoff({
                quoteId: input.quoteId,
                inputId: drawingInput.id,
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
              await updateInputProcessing(drawingInput.id, {
                processedContent: formatTakeoffForQuoteContext(takeoffResult, {}),
                processingStatus: "completed",
              });
            } catch (rerunErr: any) {
              console.warn(`[setReferenceOnly] Re-run (unmark) failed for input ${drawingInput.id}: ${rerunErr.message}`);
            }
          }
        }

        const updated = await getInputById(input.inputId);
        return { success: true, input: updated };
      }),
  }),
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

        // Merge legend symbols into symbolDescriptions so chips show full descriptions
        const tenderCtx = await getTenderContextByQuoteId(takeoff.quoteId);
        const legendSymbols: Record<string, string> = {};
        if (tenderCtx?.symbolMappings) {
          for (const [k, v] of Object.entries(tenderCtx.symbolMappings)) {
            legendSymbols[k] = (v as any).meaning || '';
          }
        }
        
        return {
          ...takeoff,
          symbolStyles: SYMBOL_STYLES,
          symbolDescriptions: { ...SYMBOL_DESCRIPTIONS, ...legendSymbols },
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
        await assertAIAccess(ctx.user.id);
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

        // Fetch legend symbolMap for this quote (populated when legend sheet is toggled)
        const tenderCtx = await getTenderContextByQuoteId(input.quoteId);
        const symbolMap: Record<string, string> = {};
        if (tenderCtx?.symbolMappings) {
          for (const [k, v] of Object.entries(tenderCtx.symbolMappings)) {
            symbolMap[k] = (v as any).meaning || '';
          }
        }

        // Run electrical takeoff extraction with legend symbol map
        const result = await performElectricalTakeoff(pdfBuffer, inputRecord.filename || 'Unknown', symbolMap);
        
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
          processedContent: formatTakeoffForQuoteContext(result, symbolMap),
          processingStatus: "completed",
        });

        // Save embedded legend symbols to tenderContext.symbolMappings (same as auto-takeoff path)
        if (result.embeddedLegendSymbols && Object.keys(result.embeddedLegendSymbols).length > 0) {
          const existingCtx2 = await getTenderContextByQuoteId(input.quoteId);
          const existing2 = (existingCtx2?.symbolMappings as Record<string, {meaning: string; confirmed: boolean}> | null) ?? {};
          const merged2: Record<string, {meaning: string; confirmed: boolean}> = { ...existing2 };
          for (const [k, v] of Object.entries(result.embeddedLegendSymbols)) {
            if (!merged2[k]) merged2[k] = { meaning: v, confirmed: false };
          }
          await upsertTenderContext(input.quoteId, { symbolMappings: merged2 });
          console.log(`[Electrical Takeoff] Saved ${Object.keys(result.embeddedLegendSymbols).length} embedded legend symbols to tenderContext`);
        }

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
              trayFilter: "all", trayDuty: "medium",
              extraDropPerFitting: 2.0, firstPointRunLength: 15.0,
              numberOfCircuits: 0, additionalCablePercent: 10,
              wholesalerLengthMetres: 3,
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
          symbolDescriptions: { ...SYMBOL_DESCRIPTIONS, ...symbolMap },
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

        // Fetch legend symbolMap for full descriptions
        const tenderCtx = await getTenderContextByQuoteId(takeoff.quoteId);
        const symbolMap: Record<string, string> = {};
        if (tenderCtx?.symbolMappings) {
          for (const [k, v] of Object.entries(tenderCtx.symbolMappings)) {
            symbolMap[k] = (v as any).meaning || '';
          }
        }
        
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
        
        const updated = applyUserAnswers(storedResult as any, input.answers, symbolMap);
        const svgOverlay = generateSvgOverlay(updated);
        
        // Update database
        const updatedTakeoff = await updateElectricalTakeoff(takeoff.id, {
          symbols: updated.symbols,
          counts: updated.counts,
          userAnswers: input.answers,
          svgOverlay,
          status: 'draft',
        });
        
        // Update input processed content with new counts (including legend descriptions)
        if (takeoff.inputId) {
          await updateInputProcessing(Number(takeoff.inputId), {
            processedContent: formatTakeoffForQuoteContext(updated, symbolMap),
          });
        }
        
        return {
          takeoff: updatedTakeoff,
          symbolStyles: SYMBOL_STYLES,
          symbolDescriptions: { ...SYMBOL_DESCRIPTIONS, ...symbolMap },
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
          // Fetch legend symbolMap for accurate descriptions
          const exclTenderCtx = await getTenderContextByQuoteId(takeoff.quoteId);
          const exclSymbolMap: Record<string, string> = {};
          if (exclTenderCtx?.symbolMappings) {
            for (const [k, v] of Object.entries(exclTenderCtx.symbolMappings)) {
              exclSymbolMap[k] = (v as any).meaning || '';
            }
          }
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
            processedContent: formatTakeoffForQuoteContext(filteredResult as any, exclSymbolMap),
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
        force: z.boolean().optional(), // true = re-run even if a record already exists
      }))
      .mutation(async ({ ctx, input }) => {
        await assertAIAccess(ctx.user.id);
        const quote = await getQuoteWithOrgAccess(input.quoteId, ctx.user.id);
        if (!quote) throw new Error("Quote not found");

        const inputRecord = await getInputById(input.inputId);
        if (!inputRecord || !inputRecord.fileKey) {
          throw new Error("Input file not found");
        }

        // When force=true (Re-run Takeoff button), delete existing record first so the
        // fresh run is cleanly inserted. Without this, duplicate rows accumulate and
        // getByInputId (no ORDER BY) may return a stale row with empty segments,
        // preventing the "View Drawing" button from ever appearing.
        if (input.force) {
          await deleteContainmentTakeoffByInputId(input.inputId);
          console.log(`[Containment Takeoff] Force re-run: deleted existing record for input ${input.inputId}`);
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
          trayFilter: "all",
          trayDuty: "medium",
          extraDropPerFitting: 2.0,
          firstPointRunLength: 15.0,
          numberOfCircuits: 0,
          additionalCablePercent: 10,
          wholesalerLengthMetres: 3,
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
          wholesalerLengthMetres: z.number().min(0.5).max(12).default(3),
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
        const storedUserInputs = (takeoff.userInputs || {}) as any;
        const stickLen = storedUserInputs.wholesalerLengthMetres || 3;
        const updatedRuns = input.trayRuns.map(edited => {
          const existing = existingRuns.find((r: any) => r.id === edited.id);
          return {
            ...existing,
            ...edited,
            wholesalerLengths: Math.ceil(edited.lengthMetres / stickLen),
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
        pricingType: z.enum(['standard', 'monthly', 'optional', 'annual']).optional(),
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
        pricingType: z.enum(['standard', 'monthly', 'optional', 'annual']).optional(),
        isActive: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { id, ...rawData } = input;
        // Filter out undefined values so editing one field doesn't null out others
        const data: Record<string, any> = {};
        for (const [key, val] of Object.entries(rawData)) {
          if (val !== undefined) data[key] = val;
        }
        return updateCatalogItem(id, ctx.user.id, data);
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await deleteCatalogItem(input.id, ctx.user.id);
        return { success: true };
      }),

    // ── getSectorTemplate ─────────────────────────────────────────────────
    // Returns the starter catalog template for the user's sector along with
    // which item names already exist in their catalog. Used by the Catalog
    // page to render the selection dialog — user picks which items to add.
    //
    // Also returns catalog-capacity metadata (maxCatalogItems, currentCount,
    // remaining) so the UI can surface remaining headroom and disable the
    // confirm button when a selection would exceed the plan cap. The server
    // also enforces this cap in seedFromSectorTemplate as defense-in-depth.
    //
    // Returns { sector, items[], alreadyInCatalog[], maxCatalogItems,
    // currentCount, remaining }. If no seed exists for the sector, items[]
    // is empty (handled gracefully by the UI).
    //
    // Capacity semantics:
    //   - maxCatalogItems: -1 means unlimited (Pro/Team/Business). Otherwise
    //     the numeric cap (100 default for Trial/Solo post-18-Apr-2026).
    //   - remaining: -1 mirrors unlimited. Otherwise max(0, cap - currentCount).
    //   - null org.maxCatalogItems defaults to 100 — same fallback as
    //     stripe.ts canAddCatalogItem.
    getSectorTemplate: protectedProcedure
      .query(async ({ ctx }) => {
        const sector = ctx.user.defaultTradeSector;
        if (!sector) {
          return {
            sector: null,
            items: [],
            alreadyInCatalog: [],
            maxCatalogItems: 100,
            currentCount: 0,
            remaining: 100,
          };
        }

        const seed = getCatalogSeedForSector(sector);
        const org = await getUserPrimaryOrg(ctx.user.id);

        // Compute capacity regardless of whether a seed exists — the UI
        // might still show the cap in a future empty-seed state.
        const maxCatalogItems = (org as any)?.maxCatalogItems ?? 100;
        let currentCount = 0;
        let alreadyInCatalog: string[] = [];

        if (org) {
          const existing = await getCatalogItemsByOrgId(org.id);
          currentCount = existing.length;
          if (seed && seed.length > 0) {
            const existingLower = new Set(existing.map((i) => i.name.toLowerCase()));
            alreadyInCatalog = seed
              .filter((item) => existingLower.has(item.name.toLowerCase()))
              .map((item) => item.name);
          }
        }

        const remaining =
          maxCatalogItems === -1 ? -1 : Math.max(0, maxCatalogItems - currentCount);

        if (!seed || seed.length === 0) {
          return {
            sector,
            items: [],
            alreadyInCatalog: [],
            maxCatalogItems,
            currentCount,
            remaining,
          };
        }

        // Return a plain-data view of the seed — no functions, no symbols.
        const items = seed.map((item) => ({
          name: item.name,
          description: item.description,
          category: item.category,
          unit: item.unit,
          pricingType: item.pricingType,
          defaultRate: item.defaultRate,
          costPrice: item.costPrice,
        }));

        return {
          sector,
          items,
          alreadyInCatalog,
          maxCatalogItems,
          currentCount,
          remaining,
        };
      }),

    // ── seedFromSectorTemplate ─────────────────────────────────────────────
    // Seed a starter catalog for the user's sector. Fires when an existing
    // user confirms the selection dialog on the Catalog page. Safe to call
    // multiple times — items whose names already exist in the catalog are
    // skipped (idempotent by name).
    //
    // Accepts optional selectedNames array — if provided, only seeds items
    // whose names are in the array. If omitted, seeds all items from the
    // sector's template (used by auto-seed on new registration via db.ts).
    seedFromSectorTemplate: protectedProcedure
      .input(
        z
          .object({
            selectedNames: z.array(z.string()).optional(),
          })
          .optional()
      )
      .mutation(async ({ ctx, input }) => {
        const org = await getUserPrimaryOrg(ctx.user.id);
        if (!org) {
          throw new Error("No organization found for user");
        }

        const sector = ctx.user.defaultTradeSector;
        if (!sector) {
          throw new Error(
            "No default trade sector set. Set one in Settings first, then reload the starter catalog."
          );
        }

        const seed = getCatalogSeedForSector(sector);
        if (!seed || seed.length === 0) {
          throw new Error(
            `No starter catalog template exists yet for sector "${sector}". This feature is currently available for: IT Services, Website & Digital Marketing, Commercial Cleaning, Pest Control.`
          );
        }

        // Filter by user selection (if provided). Case-insensitive match.
        const selectedLower = input?.selectedNames
          ? new Set(input.selectedNames.map((n) => n.toLowerCase()))
          : null;
        const userSelected = selectedLower
          ? seed.filter((item: { name: string }) => selectedLower.has(item.name.toLowerCase()))
          : seed;

        // Dedupe by name against existing catalog. Safe to call repeatedly —
        // double-clicks and accidental re-runs never produce duplicate rows.
        const existing = await getCatalogItemsByOrgId(org.id);
        const existingNames = new Set(existing.map((i) => i.name.toLowerCase()));
        const toSeed = userSelected.filter(
          (item: { name: string }) => !existingNames.has(item.name.toLowerCase())
        );
        const skipped = userSelected.length - toSeed.length;

        if (toSeed.length === 0) {
          return { seeded: 0, skipped, sector };
        }

        // Pre-flight cap check — defense-in-depth behind the client-side
        // disable. Skipped entirely when the org has unlimited catalog
        // (maxCatalogItems === -1, i.e. Pro/Team/Business). Null defaults
        // to 100 for consistency with canAddCatalogItem in stripe.ts.
        const cap = (org as any).maxCatalogItems ?? 100;
        if (cap !== -1 && existing.length + toSeed.length > cap) {
          const overBy = existing.length + toSeed.length - cap;
          throw new Error(
            `Adding ${toSeed.length} item${toSeed.length === 1 ? "" : "s"} would exceed your ${cap}-item catalogue cap. Deselect ${overBy} item${overBy === 1 ? "" : "s"} or upgrade your plan for unlimited catalogue.`
          );
        }

        // Insert via the shared helper path — same as auto-seed in createUser.
        let seeded = 0;
        for (const item of toSeed) {
          await createCatalogItem({
            orgId: org.id,
            userId: ctx.user.id,
            name: item.name,
            description: item.description,
            category: item.category,
            unit: item.unit,
            defaultRate: item.defaultRate,
            costPrice: item.costPrice,
            pricingType: item.pricingType,
            isActive: 1,
          });
          seeded++;
        }

        return { seeded, skipped, sector };
      }),
  }),

  // ============ SUBSCRIPTION (real router with Stripe integration) ============
  subscription: subscriptionRouter,
  admin: adminRouter,

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
        await assertAIAccess(ctx.user.id);
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
        await assertAIAccess(ctx.user.id);
        console.log(`[parseDictationSummary] Starting for quoteId=${input.quoteId}`);

        const quote = await getQuoteWithOrgAccess(input.quoteId, ctx.user.id);
        if (!quote) throw new Error("Quote not found");

        const inputRecords = await getInputsByQuoteId(input.quoteId);

        const tradePresetKey = (quote as any)?.tradePreset as string | null;
        const userTradeSector = ctx.user.defaultTradeSector || null;

        // Fetch catalog items — org-first for team/org consistency
        const org = await getUserPrimaryOrg(ctx.user.id);
        const catalogItems = org
          ? await getCatalogItemsByOrgId(org.id)
          : await getCatalogItemsByUserId(ctx.user.id);

        // Build catalog context string (same format as before — preserved for G1)
        let catalogContext = "";
        if (catalogItems.length > 0) {
          catalogContext = `\n\nCOMPANY CATALOG — these are the user's products and services with their set prices:
${catalogItems.map(c => `- "${c.name}" | Sell: £${c.defaultRate}/${c.unit}${c.costPrice ? ` | Buy-in: £${c.costPrice}` : ""}${(c as any).installTimeHrs ? ` | Install: ${(c as any).installTimeHrs}hrs/unit` : ""} | Category: ${c.category || "General"} | Pricing: ${(c as any).pricingType || "standard"}${c.description ? ` | ${c.description}` : ""}`).join("\n")}

PRICING TYPES — each catalog item has a pricing type that MUST be preserved:
- "standard" = one-off cost included in the quote total (the default)
- "monthly" = recurring monthly service — shown separately, NOT included in the one-off total
- "optional" = add-on the client can choose — shown separately, NOT included in the one-off total
- "annual" = yearly recurring cost — shown separately, NOT included in the one-off total
When extracting materials, ALWAYS include a "pricingType" field matching the catalog item's pricing type.
CRITICAL: Look at the "Pricing:" field shown next to each catalog item above. If a catalog item says "Pricing: optional", the material MUST have "pricingType": "optional". If it says "Pricing: monthly", it MUST be "monthly". If it says "Pricing: annual", it MUST be "annual". Do NOT override the catalog's pricing type — it was set by the user for a reason. If no catalog match, default to "standard". For tenders that explicitly request annual costs (e.g. maintenance contracts), use "annual".`;
        }

        // Assemble EngineInput — engines receive all context via this sealed struct
        const engineInput: EngineInput = {
          tradePreset: tradePresetKey,
          userTradeSector,
          inputRecords: inputRecords.map((inp: any) => ({
            id: inp.id,
            inputType: inp.inputType,
            content: inp.content ?? null,
            fileUrl: inp.fileUrl ?? null,
            filename: inp.filename ?? null,
            processedContent: inp.processedContent ?? null,
            extractedText: inp.extractedText ?? null,
            mimeType: inp.mimeType ?? null,
          })),
          catalogContext,
        };

        // Route to the correct engine — engines are sealed, only see EngineInput
        const engine = selectEngine(tradePresetKey || userTradeSector);
        console.log(`[parseDictationSummary] Engine selected: ${engine.constructor.name} for preset="${tradePresetKey || userTradeSector || "none"}"`);

        const engineOutput = await engine.analyse(engineInput);
        console.log(`[parseDictationSummary] Engine output: engineUsed=${engineOutput.engineUsed}, materials=${engineOutput.materials?.length ?? 0}, riskNotes=${engineOutput.riskNotes ?? "none"}`);

        // Guard: if engine returned empty materials and no jobDescription, treat as no summary
        if (!engineOutput.jobDescription && (!engineOutput.materials || engineOutput.materials.length === 0)) {
          return { hasSummary: false, summary: null };
        }

        return {
          hasSummary: true,
          summary: engineOutput,
        };
      }),

    // Quick trade-relevance check before full generation (Option A guardrail)
    // ── diagnoseEvidence ─────────────────────────────────────────────────────
    // Stage-1 lightweight classifier that runs BEFORE parseDictationSummary.
    // Returns canQuote:true  → happy path, parseDictationSummary runs as normal.
    // Returns canQuote:false → surfaces diagnosis + one clarification question to user.
    // On failure or no inputs, always returns canQuote:true (fail-open = never blocks).
    diagnoseEvidence: protectedProcedure
      .input(z.object({
        quoteId: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        await assertAIAccess(ctx.user.id);
        console.log(`[diagnoseEvidence] Starting for quoteId=${input.quoteId}`);

        const quote = await getQuoteWithOrgAccess(input.quoteId, ctx.user.id);
        if (!quote) throw new Error("Quote not found");

        const inputRecords = await getInputsByQuoteId(input.quoteId);

        // No inputs yet — let parseDictationSummary handle gracefully
        if (inputRecords.length === 0) {
          console.log(`[diagnoseEvidence] No inputs — passing through`);
          return { canQuote: true, understood: "", sector: null, clientName: null, clarificationQuestion: null };
        }

        // Build a concise evidence snapshot (first 300 chars per input — enough for diagnosis)
        const evidenceSummary = inputRecords
          .filter((inp: any) => !inp.mimeType?.includes(";reference=true"))
          .map((inp: any) => {
            if (inp.inputType === "audio" && inp.content) return `Audio recording: "${inp.content.substring(0, 300)}"`;
            if (inp.processedContent) return `Document (${inp.filename || inp.inputType}): "${inp.processedContent.substring(0, 300)}"`;
            if (inp.extractedText) return `Document (${inp.filename || inp.inputType}): "${inp.extractedText.substring(0, 300)}"`;
            if (inp.content) return `Text: "${inp.content.substring(0, 300)}"`;
            return `File: ${inp.filename || inp.inputType}`;
          }).join("\n\n");

        const tradePresetKey = (quote as any)?.tradePreset as string | null;
        const userTradeSector = ctx.user.defaultTradeSector || null;
        const tradeLabel = tradePresetKey || userTradeSector || "general trades/construction";

        const systemPrompt = `You are a quick evidence classifier for a quoting tool used by "${tradeLabel}" businesses.

Read the evidence below and decide if it contains enough information to generate a meaningful quote or quote draft.

THRESHOLD — set canQuote: true if the evidence contains ANY of:
- A job description, even vague ("fit bathroom", "install network", "clean offices")
- A client name or site address
- Any materials, quantities, or services
- Any trade-related scope, even partially described
- A site survey or meeting where trade work was discussed

Set canQuote: false ONLY when the evidence contains NONE of the above — e.g. a radio programme, an unrelated business meeting with no trade scope, random conversation with no job mentioned.

IMPORTANT: Bias strongly toward canQuote: true. When in doubt, return true. A thin scope is still a scope.

When canQuote: false, write the "understood" field as a warm, intelligent summary of what you DID hear — show the user the AI was listening. E.g. "I heard a meeting about a print company called Manning Group — discussing social media strategy, catalogue work, and a competitor called Park Communications."

Write "clarificationQuestion" as one focused, friendly question. Do not ask for everything at once.

Respond ONLY with valid JSON — no preamble, no markdown:
{
  "canQuote": boolean,
  "understood": string,
  "sector": string | null,
  "clientName": string | null,
  "clarificationQuestion": string | null
}`;

        try {
          const result = await invokeClaude({
            system: systemPrompt,
            maxTokens: 400,
            messages: [{ role: "user", content: evidenceSummary }],
          });

          const raw = result.content?.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim() || "";
          console.log(`[diagnoseEvidence] Raw response: ${raw.substring(0, 200)}`);

          const parsed = JSON.parse(raw);
          return {
            canQuote: parsed.canQuote !== false, // fail-open: anything other than explicit false → proceed
            understood: parsed.understood || "",
            sector: parsed.sector || null,
            clientName: parsed.clientName || null,
            clarificationQuestion: parsed.clarificationQuestion || null,
          };
        } catch (err) {
          console.warn(`[diagnoseEvidence] Failed — failing open:`, err);
          // Always fail open — never block the user
          return { canQuote: true, understood: "", sector: null, clientName: null, clarificationQuestion: null };
        }
      }),

    // ── addClarificationInput ─────────────────────────────────────────────────
    // Appends a synthetic text input record containing the user's clarification answer.
    // This becomes evidence for the subsequent parseDictationSummary re-run.
    addClarificationInput: protectedProcedure
      .input(z.object({
        quoteId: z.number(),
        clarification: z.string().min(1).max(2000),
      }))
      .mutation(async ({ ctx, input }) => {
        const quote = await getQuoteWithOrgAccess(input.quoteId, ctx.user.id);
        if (!quote) throw new Error("Quote not found");

        await createInput({
          quoteId: input.quoteId,
          inputType: "text",
          content: `User clarification: ${input.clarification}`,
          filename: "clarification",
          processingStatus: "completed",
          processedContent: `User clarification: ${input.clarification}`,
        });

        console.log(`[addClarificationInput] Added clarification for quoteId=${input.quoteId}: "${input.clarification.substring(0, 80)}"`);
        return { success: true };
      }),

    // Legacy alias — kept for any existing client calls during transition
    tradeRelevanceCheck: protectedProcedure
      .input(z.object({ quoteId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        return { relevant: true, message: "" };
      }),

    // Generate a draft quote from all processed inputs
    generateDraft: protectedProcedure
      .input(z.object({
        quoteId: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        await assertAIAccess(ctx.user.id);
        const quote = await getQuoteWithOrgAccess(input.quoteId, ctx.user.id);
        if (!quote) throw new Error("Quote not found");

        // Get all inputs for this quote
        const inputs = await getInputsByQuoteId(input.quoteId);
        const tenderContext = await getTenderContextByQuoteId(input.quoteId);
        const internalEstimate = await getInternalEstimateByQuoteId(input.quoteId);

        // Fetch organization profile for company defaults
        const org = await getUserPrimaryOrg(ctx.user.id);

        // Fetch catalog items — org-first for team/org consistency
        const catalogItems = org
          ? await getCatalogItemsByOrgId(org.id)
          : await getCatalogItemsByUserId(ctx.user.id);
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
          defaultTerms: (org as any).defaultTerms || ctx.user.defaultTerms || null,
        } : null;

        // Build context from all processed inputs
        const processedEvidence: string[] = [];
        
        // Separate voice dictations for ordered processing
        let voiceNoteIndex = 0;
        
        for (const inp of inputs) {
          // Bug 2 fix: skip reference-only inputs (legend sheets etc.) in generateDraft.
          // parseDictationSummary already does this — generateDraft must match.
          // Pattern: mimeType ends with ";reference=true" when user marks PDF as reference-only.
          if (inp.mimeType?.includes(";reference=true")) continue;

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
        // NOTE: userPrompt is now ONLY used for electrical takeoff symbol filtering.
        // QDS items are read directly from qdsSummaryJson — not serialised into userPrompt.

        if (processedEvidence.length === 0) {
          throw new Error("No evidence found. Please add text in the 'Email/Instructions for AI' field, or upload and process files (transcribe audio, extract PDF text, analyze images).");
        }

        // ── QDS Direct Line Items ─────────────────────────────────────────────
        // Parse qdsSummaryJson and convert confirmed QDS items directly into line
        // items — bypassing GPT-4o reinterpretation entirely.
        // GPT-4o only handles: description, title, clientName/address, assumptions,
        // exclusions, terms, riskNotes.
        //
        // Beta-1: materials may carry `sourceInputIds` from the engine. We thread
        // them through so the response can expose a lineItemId → inputIds map for
        // the unified workspace's two-way highlighting (held in-memory on the
        // client for Beta-1; Beta-2 will persist to quote_line_items.source_input_ids).
        let qdsLineItems: Array<{
          description: string;
          quantity: number;
          unit: string;
          rate: number;
          pricingType: string;
          sortOrder: number;
          sourceInputIds?: number[];
          // Chunk 2b-ii: provenance signals from the engine, threaded
          // straight into the provenance columns on each line item.
          itemName?: string;
          passthrough?: boolean;
          evidenceCategory?: string | null;
          substitutable?: boolean | null;
          estimated?: boolean;
        }> = [];

        // ── Beta-2 Chunk 2b-ii: inline engine run (adapter column dropped) ─────
        // Run the sector engine directly inside generateDraft so the whole
        // Generate Quote action is one round-trip. The qds_summary_json
        // scratch-pad column that this used to hand off through was dropped
        // in migration 0014; nothing reads or writes it in the four-sector
        // flow anymore.
        let qdsSummaryRaw: string | null = null;
        {
          const tradePresetKey = (quote as any)?.tradePreset as string | null;
          const userTradeSector = ctx.user.defaultTradeSector || null;

          let catalogContext = "";
          if (catalogItems.length > 0) {
            catalogContext = `\n\nCOMPANY CATALOG — these are the user's products and services with their set prices:
${catalogItems.map(c => `- "${c.name}" | Sell: £${c.defaultRate}/${c.unit}${c.costPrice ? ` | Buy-in: £${c.costPrice}` : ""}${(c as any).installTimeHrs ? ` | Install: ${(c as any).installTimeHrs}hrs/unit` : ""} | Category: ${c.category || "General"} | Pricing: ${(c as any).pricingType || "standard"}${c.description ? ` | ${c.description}` : ""}`).join("\n")}

PRICING TYPES — each catalog item has a pricing type that MUST be preserved:
- "standard" = one-off cost included in the quote total (the default)
- "monthly" = recurring monthly service — shown separately, NOT included in the one-off total
- "optional" = add-on the client can choose — shown separately, NOT included in the one-off total
- "annual" = yearly recurring cost — shown separately, NOT included in the one-off total
When extracting materials, ALWAYS include a "pricingType" field matching the catalog item's pricing type.
CRITICAL: Look at the "Pricing:" field shown next to each catalog item above. If a catalog item says "Pricing: optional", the material MUST have "pricingType": "optional". If it says "Pricing: monthly", it MUST be "monthly". If it says "Pricing: annual", it MUST be "annual". Do NOT override the catalog's pricing type — it was set by the user for a reason. If no catalog match, default to "standard". For tenders that explicitly request annual costs (e.g. maintenance contracts), use "annual".`;
          }

          const engineInput: EngineInput = {
            tradePreset: tradePresetKey,
            userTradeSector,
            inputRecords: inputs.map((inp: any) => ({
              id: inp.id,
              inputType: inp.inputType,
              content: inp.content ?? null,
              fileUrl: inp.fileUrl ?? null,
              filename: inp.filename ?? null,
              processedContent: inp.processedContent ?? null,
              extractedText: inp.extractedText ?? null,
              mimeType: inp.mimeType ?? null,
            })),
            catalogContext,
          };

          const engine = selectEngine(tradePresetKey || userTradeSector);
          console.log(`[generateDraft] Inline engine run: ${engine.constructor.name} for preset="${tradePresetKey || userTradeSector || "none"}"`);
          const engineOutput = await engine.analyse(engineInput);
          console.log(`[generateDraft] Inline engine output: engineUsed=${engineOutput.engineUsed}, materials=${engineOutput.materials?.length ?? 0}`);

          // Guard: engine returned nothing usable — surface the same toast
          // text the client used to show. Thrown before any destructive
          // work (no line items have been deleted yet at this point).
          if (!engineOutput.jobDescription && (!engineOutput.materials || engineOutput.materials.length === 0)) {
            throw new Error("Couldn't extract a quote from the evidence. Try adding more detail.");
          }

          qdsSummaryRaw = JSON.stringify(engineOutput);
        }
        // ── end Chunk 2b-ii inline engine run ──────────────────────────────────
        if (qdsSummaryRaw) {
          try {
            const qds = JSON.parse(qdsSummaryRaw);
            let sortIdx = 0;

            // ── Electrical QDS branch ─────────────────────────────────────
            // When qdsSummaryJson was written by ElectricalQDS.tsx it carries
            // _type: "electrical". Route to the dedicated converter which handles
            // rows (supply items), phase-based labour, firstPoints, plantHire,
            // preliminaries, and sundries allowance.
            // This branch is gated on _type — never fires for any other sector.
            if (qds._type === "electrical") {
              qdsLineItems = generateElectricalLineItems(qds, 0);
              console.log(`[generateDraft] Electrical QDS direct line items: ${qdsLineItems.length} items`);
              // Skip the general materials/labour/plantHire paths below
            } else {

            // Materials → line items (each material is one line item)
            if (qds.materials && Array.isArray(qds.materials)) {
              for (const m of qds.materials) {
                if (!m.item) continue;
                const qty = parseFloat(m.quantity) || 1;
                const rate = parseFloat(m.unitPrice) || 0;
                // Always prepend the item title so it appears on the quote line
                // e.g. "8-port Gigabit PoE Switch — Edge switches for co-working mezzanine..."
                const description = m.description
                  ? `${m.item} — ${m.description}`
                  : m.item;
                const costPrice = m.costPrice != null ? parseFloat(String(m.costPrice)) || null : null;
                // Beta-1: preserve sourceInputIds if the material carries them.
                // Sanitise to a clean number[] — tolerate missing or malformed.
                let sourceInputIds: number[] | undefined;
                if (Array.isArray(m.sourceInputIds)) {
                  const valid = (m.sourceInputIds as unknown[])
                    .map((v) => (typeof v === "number" ? v : parseInt(String(v), 10)))
                    .filter((v): v is number => Number.isFinite(v) && v > 0);
                  if (valid.length > 0) sourceInputIds = valid;
                }
                qdsLineItems.push({
                  description,
                  quantity: qty,
                  unit: m.unit || "each",
                  rate,
                  costPrice: costPrice != null ? String(costPrice) : null,
                  pricingType: m.pricingType || "standard",
                  sortOrder: sortIdx++,
                  sourceInputIds,
                  // Chunk 2b-ii: engine-emitted provenance, threaded
                  // through for population at line-item creation.
                  itemName: m.item,
                  passthrough: m.passthrough === true,
                  evidenceCategory: m.evidenceCategory ?? null,
                  substitutable: m.substitutable ?? null,
                  estimated: m.estimated === true,
                } as any);
              }
            }

            // Labour → line items
            if (qds.labour && Array.isArray(qds.labour)) {
              const labourRate = parseFloat(qds.labourRate) || 0;
              for (const l of qds.labour) {
                if (!l.role) continue;
                const qty = parseFloat(l.quantity) || 1;
                // Duration as unit if provided (e.g. "days", "hours")
                const unit = l.duration || "hours";
                qdsLineItems.push({
                  description: l.role,
                  quantity: qty,
                  unit,
                  rate: labourRate,
                  pricingType: "standard",
                  sortOrder: sortIdx++,
                  // Chunk 2b-ii: labour rows have no engine-emitted
                  // provenance — use defaults matching the demo seeders.
                  itemName: l.role,
                  passthrough: false,
                  evidenceCategory: "labour",
                  substitutable: null,
                  estimated: false,
                });
              }
            }

            // Plant / Hire → line items
            if (qds.plantHire && Array.isArray(qds.plantHire)) {
              for (const p of qds.plantHire) {
                if (!p.description) continue;
                const qty = parseFloat(p.quantity) || 1;
                const rate = parseFloat(p.sellPrice) || 0;
                const costPrice = p.costPrice != null ? parseFloat(p.costPrice) : null;
                const desc = p.duration ? `${p.description} (${p.duration})` : p.description;
                qdsLineItems.push({
                  description: desc,
                  quantity: qty,
                  unit: "each",
                  rate,
                  costPrice: costPrice != null ? String(costPrice) : null,
                  pricingType: "standard",
                  sortOrder: sortIdx++,
                  // Chunk 2b-ii: plant-hire has no engine-emitted
                  // provenance — use defaults matching the demo seeders.
                  itemName: p.description,
                  passthrough: false,
                  evidenceCategory: "plant_hire",
                  substitutable: null,
                  estimated: false,
                } as any);
              }
            }

            console.log(`[generateDraft] QDS direct line items: ${qdsLineItems.length} items from qdsSummaryJson`);
            } // end else (non-electrical general QDS path)
          } catch (e) {
            console.warn("[generateDraft] Failed to parse qdsSummaryJson — will rely on AI only:", e);
            qdsLineItems = [];
          }
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

        // Price hierarchy for items GPT-4o creates (comprehensive mode or no QDS).
        // QDS-confirmed items are now inserted directly — not via AI reinterpretation.
        const priceHierarchyContext = `\n\nPRICE & RATE HIERARCHY — for any line items you generate:
1. Company catalog rates — use when items match by name.
2. Company default rates from settings (markup %, labour rate).
3. UK market rate estimates — realistic, never 0.

VOICE DICTATION PROCESSING:
- Voice dictations are numbered. Process sequentially — later notes override earlier ones.
- Extract: client name, job description, labour, material prices, markups, location, timeline.
- If user gives a lump sum (e.g. "charge 700/day for 2 days"), create line items that reflect this.`;

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
          if (orgDefaults.defaultTerms) {
            parts.push(`\nDEFAULT TERMS & CONDITIONS — Reproduce these verbatim in the "terms" field. Do not rewrite, summarise, or modify:\n${orgDefaults.defaultTerms}`);
          }
          companyDefaultsContext = parts.join("\n");
        }

        // Takeoff deduplication rule — injected when both takeoff evidence and catalog items are present
        const hasTakeoffEvidence = processedEvidence.some(e => e.includes("ELECTRICAL TAKEOFF") || e.includes("SYMBOL COUNTS"));
        const takeoffDedupContext = (hasTakeoffEvidence && catalogItems.length > 0) ? `\n\nELECTRICAL TAKEOFF — CATALOG MATCHING RULES (CRITICAL — READ CAREFULLY):
The evidence contains both an ELECTRICAL TAKEOFF (with symbol counts) and a COMPANY CATALOG (with item names and rates).
Many takeoff symbols will map to catalog items. You MUST follow these rules:

1. ONE LINE ITEM PER SYMBOL — When a takeoff symbol matches a catalog item (by name or description), create EXACTLY ONE line item. Use the catalog item's name, rate, unit, and pricingType. Use the takeoff count as the quantity. Do NOT create a separate line item for the raw symbol code on top of the catalog match.

2. NO DUPLICATES — If "Linear LED Light" already appears as a catalog-matched line item, do NOT also add a separate "Takeoff: J" or "J (Linear LED Light)" line item. They are the same thing.

3. UNMATCHED SYMBOLS — If a takeoff symbol has no catalog match, create one line item for it using the symbol description as the name. Estimate a realistic UK rate if none is available.

4. QUANTITIES FROM TAKEOFF — Always use the exact count from the SYMBOL COUNTS section as the quantity. Never use 1 as a default for takeoff items.

5. DO NOT DOUBLE-COUNT — The takeoff counts and the catalog are two sides of the same coin. The takeoff tells you HOW MANY. The catalog tells you the NAME and RATE. Merge them into one line item per symbol.` : ``;
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

        // Trade label still used for AI persona context (but no blocking guardrail)
        const userTradeSectorForGuardrail = ctx.user.defaultTradeSector || null;
        const tradeLabel = tradePresetKey || userTradeSectorForGuardrail || "general trades/construction";
        const tradeRelevanceGuardrail = "";

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
      "category": "string - the trade category (e.g. 'Structural Steelwork')",
      "pricingType": "string - 'standard' (default), 'monthly', 'optional', or 'annual'. Match catalog item's pricing type."
    }
  ],` : `
  "lineItems": [
    {
      "description": "string - detailed description of the specific deliverable",
      "quantity": number,
      "unit": "string (each, hours, days, licences, per user, etc.)",
      "rate": number,
      "phase": "string - which project phase this belongs to (e.g., 'Phase 1: Discovery & Audit')",
      "category": "string - grouping category (e.g., 'Hardware', 'Professional Services', 'Software & Licensing')",
      "pricingType": "string - 'standard' (default), 'monthly', 'optional', or 'annual'. Match catalog item's pricing type."
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
  "terms": "string - payment terms, warranty, and conditions. If the company has provided DEFAULT TERMS, reproduce them verbatim. Otherwise build from COMPANY DEFAULTS: include quote validity period, insurance limits, day work rates, working hours, return visit rate, payment terms, VAT status. Write as numbered clauses."
}

CRITICAL RULES:
- When the evidence contains specific quantities (e.g. "5 nr", "10 metres", "2.5 tonnes"), you MUST use those exact quantities. NEVER substitute your own estimates for quantities explicitly stated in the evidence.
- When a Bill of Quantities or Trade Bill is present, extract and price each item individually — do not lump items together or create generic phases.
- Use company catalog rates when items match. Only estimate rates for items with no catalog match.
- Use the company defaults provided below for working hours, insurance, exclusions, signatory details, etc. Do NOT invent these values.
${tradePromptAdditions}${boqContext}${companyDefaultsContext}${catalogContext}${takeoffDedupContext}${priceHierarchyContext}${tradeRelevanceGuardrail}`;
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
  "lineItems": [],
  "assumptions": ["string array of assumptions made"],
  "exclusions": ["string array of what is NOT included - MUST include ALL standard exclusions from company defaults plus any project-specific exclusions"],
  "terms": "string - payment terms and conditions. If the company has provided DEFAULT TERMS, reproduce them verbatim. Otherwise use the company defaults if provided: include quote validity period, payment terms, insurance limits, day work rates, return visit rates, working hours. Write as numbered clauses.",
  "riskNotes": "string - internal notes about risks or concerns",
  "symbolMappings": { "symbol": { "meaning": "string", "confirmed": false } }
}

IMPORTANT: Line items are managed separately — leave "lineItems" as an empty array. Focus on:
- Writing a high-quality project "description" (3-5 sentences, professional, client-facing)
- Extracting accurate "clientName", "clientEmail", "clientPhone", "clientAddress" from the evidence
- Generating thorough "assumptions" and "exclusions" lists
- Writing comprehensive "terms" using the company defaults

IMPORTANT for description field:
- Write 3-5 sentences in plain professional English describing the overall project scope.
- Do not use phrases like "This comprehensive quote covers" or "We are pleased to offer".
- Write as if a tradesperson is explaining the scope to the client directly.

IMPORTANT for exclusions:
- ALWAYS include every item from the STANDARD EXCLUSIONS in company defaults.
- Add any additional project-specific exclusions on top.

IMPORTANT for terms:
- Build the terms from company defaults: include validity period, insurance limits, day work rates, working hours, return visit rate, payment terms, and VAT status.

Extract all client details mentioned. Note any assumptions you are making and things that are explicitly excluded.

CRITICAL RULES:
- Use the company defaults below for working hours, insurance, exclusions, etc. Do NOT invent these values.
${boqContext}${companyDefaultsContext}${catalogContext}${takeoffDedupContext}${priceHierarchyContext}${tradeRelevanceGuardrail}`;
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

          // Option C terms guardrail: org defaultTerms always wins.
          // AI-generated terms are only used as a fallback for users who have not set defaultTerms.
          const resolvedTerms = orgDefaults?.defaultTerms || draft.terms || null;
          if (resolvedTerms) {
            quoteUpdateData.terms = resolvedTerms;
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
            // terms already resolved above via Option C guardrail — no override needed here
          }

          const updatedQuote = await updateQuote(input.quoteId, ctx.user.id, quoteUpdateData);

          // Delete existing line items before creating new ones (prevents duplicates on regenerate)
          await deleteLineItemsByQuoteId(input.quoteId);

          // Create line items
          // For simple quotes: use QDS direct line items (exact items user confirmed in QDS).
          // For comprehensive quotes (or no QDS): fall back to AI-generated line items.
          //
          // Beta-1: while creating line items we build a sourceInputMap
          // (lineItemId → inputIds) that the client uses for evidence ↔
          // line-item highlighting. The mapping is held in-memory on the
          // client for this session only; Beta-2 persists to
          // quote_line_items.source_input_ids.
          const createdLineItems = [];
          const sourceInputMap: Record<number, number[]> = {};
          const useQdsItems = !isComprehensive && qdsLineItems.length > 0;
          const itemsToCreate = useQdsItems ? qdsLineItems : (draft.lineItems && Array.isArray(draft.lineItems) ? draft.lineItems : []);

          console.log(`[generateDraft] Line item source: ${useQdsItems ? "QDS direct (" + qdsLineItems.length + " items)" : "AI generated (" + itemsToCreate.length + " items)"}`);

          for (let i = 0; i < itemsToCreate.length; i++) {
            const item = itemsToCreate[i];
            const quantity = parseFloat(String(item.quantity)) || 1;
            const rate = parseFloat(String(item.rate)) || 0;
            const total = quantity * rate;

            // ── Chunk 2b-ii: provenance + pricing-vocabulary mapping ───────
            // The engines and AI-draft path both still emit the legacy
            // pricing vocabulary ("standard" / "optional" / "monthly" /
            // "annual"). Chunk 2a renamed "standard" → "one_off" and moved
            // "optional" onto the isOptional flag with pricingType "one_off".
            // Map here at write time so downstream reads see the new shape.
            const rawPricingType = (item as any).pricingType || "standard";
            const isOptional = rawPricingType === "optional";
            const pricingType =
              rawPricingType === "standard" || rawPricingType === "optional"
                ? "one_off"
                : rawPricingType; // "monthly" | "annual" pass through

            // Derive an item name: engines emit it directly; AI-draft items
            // don't, so split the "{item} — {description}" convention used
            // app-wide as a fallback.
            const fallbackItemName = String(item.description || "").split(" — ")[0] || null;
            const itemName = (item as any).itemName ?? fallbackItemName;

            // Source input IDs: sanitise to number[] (or null for DB). Only
            // the QDS-materials path emits these today.
            const sidsRaw = (item as any).sourceInputIds;
            let sourceInputIds: number[] | null = null;
            if (Array.isArray(sidsRaw)) {
              const valid = (sidsRaw as unknown[])
                .map((v) => (typeof v === "number" ? v : parseInt(String(v), 10)))
                .filter((v): v is number => Number.isFinite(v) && v > 0);
              sourceInputIds = valid.length > 0 ? valid : [];
            } else {
              sourceInputIds = [];
            }

            const lineItem = await createLineItem({
              quoteId: input.quoteId,
              sortOrder: i,
              description: item.description || "",
              quantity: quantity.toFixed(4),
              unit: (item as any).unit || "each",
              rate: rate.toFixed(2),
              total: total.toFixed(2),
              phaseId: isComprehensive && (item as any).phase ? (item as any).phase : undefined,
              category: isComprehensive && (item as any).category ? (item as any).category : undefined,
              pricingType,
              costPrice: (item as any).costPrice ?? null,
              // Beta-2 provenance — populated at creation time so Chunk 3's
              // chips / hover pills find real data on every row regardless
              // of how the row was produced (engine QDS, engine labour /
              // plantHire, or AI-draft comprehensive).
              itemName,
              isPassthrough: (item as any).passthrough === true,
              evidenceCategory: (item as any).evidenceCategory ?? null,
              isSubstitutable:
                typeof (item as any).substitutable === "boolean"
                  ? (item as any).substitutable
                  : null,
              isEstimated: (item as any).estimated === true,
              isOptional,
              sourceInputIds,
            });
            createdLineItems.push(lineItem);
            // Beta-1: record the evidence-input mapping if this line item
            // carries sourceInputIds. The client holds this in session
            // state for two-way highlighting; Beta-2 persists the same
            // data on the row via quote_line_items.source_input_ids so
            // the client could read it there directly in future.
            if (sourceInputIds && sourceInputIds.length > 0 && (lineItem as any)?.id) {
              sourceInputMap[(lineItem as any).id as number] = sourceInputIds;
            }
          }

          // Update tender context with assumptions/exclusions
          // Guard: if the user has already saved their own assumptions or exclusions,
          // preserve them — only populate on first generation, never overwrite user edits.
          if (draft.assumptions || draft.exclusions || draft.symbolMappings) {
            const existingContext = await getTenderContextByQuoteId(input.quoteId);
            const hasUserAssumptions = existingContext?.assumptions && Array.isArray(existingContext.assumptions) && (existingContext.assumptions as any[]).length > 0;
            const hasUserExclusions = existingContext?.exclusions && Array.isArray(existingContext.exclusions) && (existingContext.exclusions as any[]).length > 0;
            await upsertTenderContext(input.quoteId, {
              assumptions: hasUserAssumptions ? undefined : draft.assumptions?.map((text: string) => ({ text, confirmed: false })),
              exclusions: hasUserExclusions ? undefined : draft.exclusions?.map((text: string) => ({ text, confirmed: false })),
              symbolMappings: draft.symbolMappings,
            });
          }

          // Update internal estimate with risk notes
          if (draft.riskNotes) {
            await upsertInternalEstimate(input.quoteId, {
              riskNotes: draft.riskNotes,
            });
          }

          // Apply org VAT default if the quote currently has no VAT set
          // This covers existing quotes created before the VAT default feature,
          // and any quote where the user hasn't manually overridden the rate.
          const orgForVat = await getUserPrimaryOrg(ctx.user.id);
          if (orgForVat) {
            const existingQuote = await getQuoteByIdAndOrg(input.quoteId, orgForVat.id);
            const currentTaxRate = parseFloat((existingQuote as any)?.taxRate || "0");
            const orgVatRate = (orgForVat as any)?.defaultDayWorkRates?.defaultVatRate;
            if (currentTaxRate === 0 && orgVatRate !== undefined && orgVatRate > 0) {
              await updateQuote(input.quoteId, ctx.user.id, { taxRate: String(orgVatRate) });
            }
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
            // Beta-1: evidence → line-item mapping for two-way highlighting.
            // Empty object on electrical (which doesn't emit sourceInputIds)
            // or when no materials carried evidence IDs. Client holds this in
            // session state; lost on refresh. Beta-2 will persist to
            // quote_line_items.source_input_ids and this field becomes
            // redundant (client can read it off each line item instead).
            sourceInputMap,
          };
        } catch (parseError) {
          console.error("Failed to parse AI response:", parseError);
          throw new Error("Failed to parse AI response. Please try again.");
        }
      }),
  }),
});

export type AppRouter = typeof appRouter;
