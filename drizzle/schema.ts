import { pgTable, pgEnum, text, timestamp, varchar, decimal, json, integer, boolean, bigserial, bigint } from "drizzle-orm/pg-core";

/**
 * IMPORTANT: IdoYourQuotes uses PostgreSQL on Render
 * Database: idoyourquotes-db (PostgreSQL 16)
 * DO NOT change to MySQL/TiDB
 * 
 * COLUMN NAMING: PostgreSQL uses snake_case column names
 * The string in column definitions MUST match the actual database column names
 */

// Enums
export const userRoleEnum = pgEnum("user_role", ["user", "admin"]);
export const orgMemberRoleEnum = pgEnum("org_member_role", ["owner", "admin", "member"]);
export const quoteStatusEnum = pgEnum("quote_status", ["draft", "sent", "accepted", "declined"]);
export const inputTypeEnum = pgEnum("input_type", ["pdf", "image", "audio", "email", "text", "document"]);
export const quoteModeEnum = pgEnum("quote_mode", ["simple", "comprehensive"]);

/**
 * Organizations - multi-tenant container for all data
 * Each user belongs to an organization (auto-created on signup for solo users)
 */
export const organizations = pgTable("organizations", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 100 }).notNull().unique(),
  companyName: varchar("company_name", { length: 255 }),
  companyAddress: text("company_address"),
  companyPhone: varchar("company_phone", { length: 50 }),
  companyEmail: varchar("company_email", { length: 320 }),
  companyLogo: text("company_logo"),
  brandPrimaryColor: varchar("brand_primary_color", { length: 7 }),
  brandSecondaryColor: varchar("brand_secondary_color", { length: 7 }),
  defaultTerms: text("default_terms"),
  billingEmail: varchar("billing_email", { length: 320 }),
  stripeCustomerId: varchar("stripe_customer_id", { length: 255 }),
  stripeSubscriptionId: varchar("stripe_subscription_id", { length: 255 }),
  stripePriceId: varchar("stripe_price_id", { length: 255 }),
  subscriptionTier: varchar("subscription_tier", { length: 50 }).default("trial"),
  subscriptionStatus: varchar("subscription_status", { length: 50 }).default("trialing"),
  subscriptionCurrentPeriodStart: timestamp("subscription_current_period_start"),
  subscriptionCurrentPeriodEnd: timestamp("subscription_current_period_end"),
  subscriptionCancelAtPeriodEnd: boolean("subscription_cancel_at_period_end").default(false),
  trialEndsAt: timestamp("trial_ends_at"),
  maxUsers: integer("max_users").default(1),
  maxQuotesPerMonth: integer("max_quotes_per_month").default(10),
  maxCatalogItems: integer("max_catalog_items").default(200),
  monthlyQuoteCount: integer("monthly_quote_count").default(0),
  quoteCountResetAt: timestamp("quote_count_reset_at"),
  aiCreditsRemaining: integer("ai_credits_remaining").default(0),
  // Trade-specific company defaults — used by AI when generating quotes
  defaultWorkingHoursStart: varchar("default_working_hours_start", { length: 10 }).default("08:00"),
  defaultWorkingHoursEnd: varchar("default_working_hours_end", { length: 10 }).default("16:30"),
  defaultWorkingDays: varchar("default_working_days", { length: 100 }).default("Monday to Friday"),
  defaultInsuranceLimits: json("default_insurance_limits").$type<{
    employers?: string;
    public?: string;
    professional?: string;
  }>(),
  defaultDayWorkRates: json("default_day_work_rates").$type<{
    labourRate?: number;
    materialMarkup?: number;
    plantMarkup?: number;
    defaultVatRate?: number;
    _emailFlags?: Record<string, string>;
  }>(),
  defaultExclusions: text("default_exclusions"),
  defaultValidityDays: integer("default_validity_days").default(30),
  defaultSignatoryName: varchar("default_signatory_name", { length: 255 }),
  defaultSignatoryPosition: varchar("default_signatory_position", { length: 255 }),
  defaultSurfaceTreatment: varchar("default_surface_treatment", { length: 255 }),
  defaultReturnVisitRate: varchar("default_return_visit_rate", { length: 255 }),
  defaultPaymentTerms: text("default_payment_terms"),
  // Phase 4A Delivery 24 — branded-mode defaults (migration
  // 0022_add_quote_overrides_and_branded_defaults). Save-as-default
  // inside the branded review gate writes here so it doesn't bleed
  // into Quick Quote mode. Renderer cascade is:
  //   quote.X → organizations.brandedX → organizations.defaultX → fallback
  // so existing orgs that already have default* set continue to see
  // them in branded output until they explicitly fork.
  brandedTerms: text("branded_terms"),
  brandedExclusions: text("branded_exclusions"),
  brandedPaymentTerms: text("branded_payment_terms"),
  brandedSignatoryName: varchar("branded_signatory_name", { length: 255 }),
  brandedSignatoryPosition: varchar("branded_signatory_position", { length: 255 }),
  // Phase 4A — Brand evidence (migration 0016_add_brand_evidence). The
  // organizations table is the canonical home for brand evidence; both
  // logo-pixel extraction and AI extraction write here. Columns were
  // applied to the live DB but never re-introspected into this file,
  // so until Delivery 11 (25 Apr 2026) Drizzle silently dropped every
  // write to them — saves looked successful client-side but never
  // landed. See conversation log around Delivery 11 for the diagnosis.
  companyWebsite: varchar("company_website", { length: 512 }),
  // Phase 4A — AI brand-extraction tokens (migration 0017_add_brand_extraction).
  // Populated by server/services/brandExtraction.ts after a save event on
  // logo / website. Distinct from brandPrimaryColor / brandSecondaryColor
  // above, which are the older logo-pixel pass. The brochure-upload feature
  // was retired in Delivery 13 (migration 0019) — extraction now reads only
  // logo + website.
  brandExtractedPrimaryColor: varchar("brand_extracted_primary_color", { length: 7 }),
  brandExtractedSecondaryColor: varchar("brand_extracted_secondary_color", { length: 7 }),
  brandExtractedFontFeel: varchar("brand_extracted_font_feel", { length: 20 }),
  brandExtractedTone: text("brand_extracted_tone"),
  brandExtractionStatus: varchar("brand_extraction_status", { length: 20 }).default("idle"),
  brandExtractionError: text("brand_extraction_error"),
  brandExtractedAt: timestamp("brand_extracted_at"),
  // Phase 4A Delivery 17 — proposal design template + cover stat strip
  // toggle (migration 0020_add_proposal_template). User-selectable design
  // template for branded proposals: 'modern' | 'structured' | 'bold'.
  // Mirrors shared/schema.ts exactly per the dual-schema rule. Stored as
  // text so a fourth template can be added later without an enum
  // migration; server-side validates against the known values.
  proposalTemplate: text("proposal_template").default("modern").notNull(),
  coverStatStripEnabled: boolean("cover_stat_strip_enabled").default(true).notNull(),
  // Phase 4A Delivery 25 — Project / Migration foundation. Three
  // already-applied columns (migration_type / hypercare_days /
  // default_hypercare_days were applied as raw SQL during the design
  // session before the dual-schema files were updated; added here for
  // the type system) plus the 24 org-level default columns introduced
  // by migration 0023_add_migration_columns.sql. Mirrors shared/schema.ts
  // exactly per the dual-schema rule.
  defaultHypercareDays: integer("default_hypercare_days").default(14).notNull(),
  defaultServerMethodology: text("default_server_methodology"),
  defaultServerPhases: text("default_server_phases"),
  defaultServerAssumptions: text("default_server_assumptions"),
  defaultServerRisks: text("default_server_risks"),
  defaultServerRollback: text("default_server_rollback"),
  defaultServerOutOfScope: text("default_server_out_of_scope"),
  defaultM365Methodology: text("default_m365_methodology"),
  defaultM365Phases: text("default_m365_phases"),
  defaultM365Assumptions: text("default_m365_assumptions"),
  defaultM365Risks: text("default_m365_risks"),
  defaultM365Rollback: text("default_m365_rollback"),
  defaultM365OutOfScope: text("default_m365_out_of_scope"),
  defaultWorkspaceMethodology: text("default_workspace_methodology"),
  defaultWorkspacePhases: text("default_workspace_phases"),
  defaultWorkspaceAssumptions: text("default_workspace_assumptions"),
  defaultWorkspaceRisks: text("default_workspace_risks"),
  defaultWorkspaceRollback: text("default_workspace_rollback"),
  defaultWorkspaceOutOfScope: text("default_workspace_out_of_scope"),
  defaultTenantMethodology: text("default_tenant_methodology"),
  defaultTenantPhases: text("default_tenant_phases"),
  defaultTenantAssumptions: text("default_tenant_assumptions"),
  defaultTenantRisks: text("default_tenant_risks"),
  defaultTenantRollback: text("default_tenant_rollback"),
  defaultTenantOutOfScope: text("default_tenant_out_of_scope"),
  // Phase 4B Delivery A — Branded Proposal with Brochure (Tile 3).
  // Mirror of the brochure columns added to shared/schema.ts. The
  // dual-schema rule from infra-gotchas requires shared/schema.ts and
  // drizzle/schema.ts to update identically. See the equivalent block
  // in shared/schema.ts for full intent and column-by-column rationale.
  brochureFileUrl: text("brochure_file_url"),
  brochureFileKey: text("brochure_file_key"),
  brochureFilename: text("brochure_filename"),
  brochureFileSize: integer("brochure_file_size"),
  brochurePageCount: integer("brochure_page_count"),
  brochureHash: varchar("brochure_hash", { length: 64 }),
  brochureExtractedAt: timestamp("brochure_extracted_at"),
  brochureDeletedAt: timestamp("brochure_deleted_at"),
  brochureKnowledge: json("brochure_knowledge").$type<{
    pageCount: number;
    classifications: Array<{
      pageNumber: number;
      tag:
        | "cover"
        | "contents"
        | "about"
        | "usp"
        | "track-record"
        | "service"
        | "testimonial"
        | "contact"
        | "other";
      clarity: "clean" | "partial";
      facts: string[];
    }>;
  }>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type Organization = typeof organizations.$inferSelect;
export type InsertOrganization = typeof organizations.$inferInsert;

/**
 * Organization Members - links users to organizations with roles
 */
export const orgMembers = pgTable("org_members", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  orgId: bigint("org_id", { mode: "number" }).notNull(),
  userId: bigint("user_id", { mode: "number" }).notNull(),
  role: orgMemberRoleEnum("role").default("member").notNull(),
  invitedAt: timestamp("invited_at").defaultNow().notNull(),
  acceptedAt: timestamp("accepted_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type OrgMember = typeof orgMembers.$inferSelect;
export type InsertOrgMember = typeof orgMembers.$inferInsert;

/**
 * Usage Logs - track AI usage for billing and analytics
 */
export const usageLogs = pgTable("usage_logs", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  orgId: bigint("org_id", { mode: "number" }).notNull(),
  userId: bigint("user_id", { mode: "number" }).notNull(),
  actionType: varchar("action_type", { length: 50 }).notNull(),
  creditsUsed: integer("credits_used").default(1).notNull(),
  metadata: json("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type UsageLog = typeof usageLogs.$inferSelect;
export type InsertUsageLog = typeof usageLogs.$inferInsert;

/**
 * Core user table backing auth flow.
 * Supports standalone email/password authentication.
 * IMPORTANT: Column names use snake_case to match PostgreSQL
 */
export const users = pgTable("users", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  email: varchar("email", { length: 320 }).notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name"),
  role: userRoleEnum("role").default("user").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  companyName: varchar("company_name", { length: 255 }),
  companyAddress: text("company_address"),
  companyPhone: varchar("company_phone", { length: 50 }),
  companyEmail: varchar("company_email", { length: 320 }),
  defaultTerms: text("default_terms"),
  companyLogo: text("company_logo"),
  defaultTradeSector: varchar("default_trade_sector", { length: 50 }),
  emailVerified: boolean("email_verified").default(false),
  emailVerificationToken: text("email_verification_token"),
  emailVerificationSentAt: timestamp("email_verification_sent_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  lastSignedIn: timestamp("last_signed_in").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Quotes - the main quote entity
 * Status: draft → sent → accepted/declined
 * Now owned by organization, with created_by tracking
 * IMPORTANT: Column names use snake_case to match PostgreSQL
 */
export const quotes = pgTable("quotes", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  orgId: bigint("org_id", { mode: "number" }),
  userId: bigint("user_id", { mode: "number" }).notNull(),
  createdByUserId: bigint("created_by_user_id", { mode: "number" }),
  reference: varchar("reference", { length: 100 }),
  status: quoteStatusEnum("status").default("draft").notNull(),
  clientName: varchar("client_name", { length: 255 }),
  contactName: varchar("contact_name", { length: 255 }),
  clientEmail: varchar("client_email", { length: 320 }),
  clientPhone: varchar("client_phone", { length: 50 }),
  clientAddress: text("client_address"),
  title: varchar("title", { length: 255 }),
  description: text("description"),
  terms: text("terms"),
  validUntil: timestamp("valid_until"),
  // Phase 4A Delivery 24 — per-quote overrides for fields that the
  // branded renderer would otherwise pull from organizations.brandedX
  // (and then organizations.defaultX) for. Lets the user override on a
  // per-quote basis from the review-before-generate gate.
  paymentTerms: text("payment_terms"),
  signatoryName: varchar("signatory_name", { length: 255 }),
  signatoryPosition: varchar("signatory_position", { length: 255 }),
  subtotal: decimal("subtotal", { precision: 12, scale: 2 }).default("0.00"),
  taxRate: decimal("tax_rate", { precision: 5, scale: 2 }).default("0.00"),
  taxAmount: decimal("tax_amount", { precision: 12, scale: 2 }).default("0.00"),
  total: decimal("total", { precision: 12, scale: 2 }).default("0.00"),
  monthlyTotal: decimal("monthly_total", { precision: 12, scale: 2 }).default("0.00"),
  annualTotal: decimal("annual_total", { precision: 12, scale: 2 }).default("0.00"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  sentAt: timestamp("sent_at"),
  acceptedAt: timestamp("accepted_at"),
  // Comprehensive quote fields
  quoteMode: quoteModeEnum("quote_mode").default("simple").notNull(),
  tradePreset: varchar("trade_preset", { length: 50 }),
  comprehensiveConfig: json("comprehensive_config").$type<ComprehensiveConfig>(),
  userPrompt: text("user_prompt"),
  processingInstructions: text("processing_instructions"),
  // Chunk 3 Delivery F — one-shot re-generate gating.
  // 0 = never generated, 1 = generated once, 2 = re-generated (locked).
  // The server refuses generateDraft calls when this reaches 2.
  // See generateDraft mutation in routers.ts for the transition rules.
  generationCount: integer("generation_count").default(0).notNull(),
  // Phase 4A Delivery 17 — per-quote design template override. NULL means
  // "use the org default" (organizations.proposalTemplate). Set via
  // BrandChoiceModal at branded-PDF generation time. Mirrors
  // shared/schema.ts exactly per the dual-schema rule.
  proposalTemplate: text("proposal_template"),
  // Phase 4A Delivery 25 — Project / Migration foundation. Two already-
  // applied columns (migration_type / hypercare_days were applied as
  // raw SQL during the design session before the schema files were
  // updated; added here for the type system) plus the seven new
  // columns introduced by migration 0023_add_migration_columns.sql.
  // Mirrors shared/schema.ts exactly per the dual-schema rule.
  migrationType: varchar("migration_type", { length: 20 }),
  migrationTypeSuggested: varchar("migration_type_suggested", { length: 20 }),
  hypercareDays: integer("hypercare_days"),
  migrationMethodology: text("migration_methodology"),
  migrationPhases: text("migration_phases"),
  migrationAssumptions: text("migration_assumptions"),
  migrationRisks: text("migration_risks"),
  migrationRollback: text("migration_rollback"),
  migrationOutOfScope: text("migration_out_of_scope"),
  // Phase 4A Delivery 40 — per-quote override for the branded-proposal
  // cover stat strip. NULL means "use auto-derived cells" (Modern's
  // narrowed Users / SLA / Uptime / £-per-user logic, or Bold's
  // Monthly / Annual / Term / Lines logic). An empty array means
  // "user explicitly cleared, render no strip". A populated array is
  // used verbatim by both renderers — same { num, label } shape that
  // the auto-derive emits. Edited from the review-before-generate modal.
  coverStatCellsOverride: json("cover_stat_cells_override").$type<
    Array<{ num: string; label: string }>
  >(),
});

export type Quote = typeof quotes.$inferSelect;
export type InsertQuote = typeof quotes.$inferInsert;

/**
 * Quote Line Items - individual items on a quote
 * IMPORTANT: Column names use snake_case to match PostgreSQL
 */
export const quoteLineItems = pgTable("quote_line_items", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  quoteId: bigint("quote_id", { mode: "number" }).notNull(),
  sortOrder: integer("sort_order").default(0),
  description: text("description").notNull(),
  quantity: decimal("quantity", { precision: 12, scale: 4 }).default("1.0000"),
  unit: varchar("unit", { length: 50 }).default("each"),
  rate: decimal("rate", { precision: 12, scale: 2 }).default("0.00"),
  total: decimal("total", { precision: 12, scale: 2 }).default("0.00"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  // Comprehensive quote phase tracking
  phaseId: varchar("phase_id", { length: 50 }),
  category: varchar("category", { length: 100 }),
  pricingType: varchar("pricing_type", { length: 20 }).default("one_off"),
  costPrice: decimal("cost_price", { precision: 12, scale: 2 }),
  // Beta-2 provenance — populated at seed time by demo quotes (Chunk 2a)
  // and by the generate-draft rewrite (Chunk 2b); consumed by the
  // frontend chips + hover pills (Chunk 3).
  itemName: varchar("item_name", { length: 255 }),
  isPassthrough: boolean("is_passthrough").default(false).notNull(),
  evidenceCategory: varchar("evidence_category", { length: 100 }),
  isSubstitutable: boolean("is_substitutable"),
  isEstimated: boolean("is_estimated").default(false).notNull(),
  isOptional: boolean("is_optional").default(false).notNull(),
  sourceInputIds: json("source_input_ids").$type<number[]>(),
});

export type QuoteLineItem = typeof quoteLineItems.$inferSelect;
export type InsertQuoteLineItem = typeof quoteLineItems.$inferInsert;

/**
 * Quote Inputs - raw evidence attached to a quote
 * Types: pdf, image, audio, email, text
 * IMPORTANT: Column names use snake_case to match PostgreSQL
 */
export const quoteInputs = pgTable("quote_inputs", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  quoteId: bigint("quote_id", { mode: "number" }).notNull(),
  inputType: inputTypeEnum("input_type").notNull(),
  filename: varchar("filename", { length: 255 }),
  fileUrl: text("file_url"),
  fileKey: varchar("file_key", { length: 255 }),
  content: text("content"),
  mimeType: varchar("mime_type", { length: 100 }),
  processedContent: text("processed_content"),
  processingStatus: varchar("processing_status", { length: 20 }).default("pending"),
  processingError: text("processing_error"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type QuoteInput = typeof quoteInputs.$inferSelect;
export type InsertQuoteInput = typeof quoteInputs.$inferInsert;

/**
 * Tender Context - interpretation layer for a quote
 * Stores symbol mappings, abbreviations, and confirmed meanings
 */
export const tenderContexts = pgTable("tender_contexts", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  quoteId: bigint("quote_id", { mode: "number" }).notNull().unique(),
  symbolMappings: json("symbol_mappings").$type<Record<string, { meaning: string; confirmed: boolean; confidence?: number }>>(),
  assumptions: json("assumptions").$type<Array<{ text: string; confirmed: boolean }>>(),
  exclusions: json("exclusions").$type<Array<{ text: string; confirmed: boolean }>>(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type TenderContext = typeof tenderContexts.$inferSelect;
export type InsertTenderContext = typeof tenderContexts.$inferInsert;

/**
 * Internal Estimates - private thinking space (never client-visible)
 */
export const internalEstimates = pgTable("internal_estimates", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  quoteId: bigint("quote_id", { mode: "number" }).notNull().unique(),
  notes: text("notes"),
  costBreakdown: json("cost_breakdown").$type<Array<{ item: string; cost: number; notes?: string }>>(),
  timeEstimates: json("time_estimates").$type<Array<{ task: string; hours: number; rate?: number }>>(),
  riskNotes: text("risk_notes"),
  aiSuggestions: json("ai_suggestions").$type<Array<{ type: string; text: string; applied: boolean }>>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type InternalEstimate = typeof internalEstimates.$inferSelect;
export type InsertInternalEstimate = typeof internalEstimates.$inferInsert;

/**
 * Electrical Takeoffs - AI-extracted symbol counts with coordinates
 * Used by the electrical sector module for drawing quantification
 * Status flow: draft → questions → verified → locked
 */
export const electricalTakeoffs = pgTable("electrical_takeoffs", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  quoteId: bigint("quote_id", { mode: "number" }).notNull(),
  inputId: bigint("input_id", { mode: "number" }).notNull(),
  drawingRef: varchar("drawing_ref", { length: 255 }),
  status: varchar("status", { length: 20 }).default("draft").notNull(),
  pageWidth: decimal("page_width", { precision: 10, scale: 2 }),
  pageHeight: decimal("page_height", { precision: 10, scale: 2 }),
  symbols: json("symbols").$type<Array<{
    id: string; symbolCode: string; category: string;
    x: number; y: number; confidence: string;
    isStatusMarker: boolean; nearbySymbol?: string;
  }>>(),
  counts: json("counts").$type<Record<string, number>>(),
  questions: json("questions").$type<Array<{
    id: string; question: string; context: string;
    options: Array<{ label: string; value: string }>;
    defaultValue?: string; symbolsAffected: number;
  }>>(),
  userAnswers: json("user_answers").$type<Record<string, string>>(),
  drawingNotes: json("drawing_notes").$type<string[]>(),
  dbCircuits: json("db_circuits").$type<string[]>(),
  hasTextLayer: boolean("has_text_layer").default(true),
  totalTextElements: integer("total_text_elements").default(0),
  svgOverlay: text("svg_overlay"),
  markupImageUrl: text("markup_image_url"),
  verifiedAt: timestamp("verified_at"),
  verifiedBy: bigint("verified_by", { mode: "number" }),
  revision: integer("revision").default(1),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type ElectricalTakeoff = typeof electricalTakeoffs.$inferSelect;
export type InsertElectricalTakeoff = typeof electricalTakeoffs.$inferInsert;

/**
 * Containment Takeoffs — tray/cable run measurements from containment drawings
 */
export const containmentTakeoffs = pgTable("containment_takeoffs", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  quoteId: bigint("quote_id", { mode: "number" }).notNull(),
  inputId: bigint("input_id", { mode: "number" }).notNull(),
  drawingRef: varchar("drawing_ref", { length: 255 }),
  status: varchar("status", { length: 20 }).default("draft").notNull(),
  pageWidth: decimal("page_width", { precision: 10, scale: 2 }),
  pageHeight: decimal("page_height", { precision: 10, scale: 2 }),
  detectedScale: varchar("detected_scale", { length: 50 }),
  paperSize: varchar("paper_size", { length: 10 }),
  trayRuns: json("tray_runs"),
  fittingSummary: json("fitting_summary"),
  userInputs: json("user_inputs"),
  cableSummary: json("cable_summary"),
  questions: json("questions"),
  userAnswers: json("user_answers"),
  drawingNotes: json("drawing_notes"),
  svgOverlay: text("svg_overlay"),
  markupImageUrl: text("markup_image_url"),
  verifiedAt: timestamp("verified_at"),
  verifiedBy: bigint("verified_by", { mode: "number" }),
  revision: integer("revision").default(1),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type ContainmentTakeoff = typeof containmentTakeoffs.$inferSelect;
export type InsertContainmentTakeoff = typeof containmentTakeoffs.$inferInsert;

/**
/**
 * Team Audit Log — records all admin actions on team members
 * action values: 'invite' | 'resend_invite' | 'remove' | 'role_change' | 'set_password' | 'reset_password'
 */
export const teamAuditLog = pgTable("team_audit_log", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  orgId: bigint("org_id", { mode: "number" }).notNull(),
  actorUserId: bigint("actor_user_id", { mode: "number" }).notNull(),  // who performed the action
  targetUserId: bigint("target_user_id", { mode: "number" }).notNull(), // who it was done to
  action: varchar("action", { length: 50 }).notNull(),
  detail: text("detail"),  // human-readable e.g. "Role changed from member → admin"
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type TeamAuditLog = typeof teamAuditLog.$inferSelect;
export type InsertTeamAuditLog = typeof teamAuditLog.$inferInsert;

/**
 * Product/Service Catalog - reusable items for quotes
 * Now owned by organization
 * IMPORTANT: Column names use snake_case to match PostgreSQL
 */
export const catalogItems = pgTable("catalog_items", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  orgId: bigint("org_id", { mode: "number" }),
  userId: bigint("user_id", { mode: "number" }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  category: varchar("category", { length: 100 }),
  unit: varchar("unit", { length: 50 }).default("each"),
  defaultRate: decimal("default_rate", { precision: 12, scale: 2 }).default("0.00"),
  costPrice: decimal("cost_price", { precision: 12, scale: 2 }),
  installTimeHrs: decimal("install_time_hrs", { precision: 6, scale: 2 }),
  pricingType: varchar("pricing_type", { length: 20 }).default("standard"),
  isActive: integer("is_active").default(1),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type CatalogItem = typeof catalogItems.$inferSelect;
export type InsertCatalogItem = typeof catalogItems.$inferInsert;

// ============ COMPREHENSIVE QUOTE TYPES ============

/**
 * ComprehensiveConfig - stored as JSONB in quotes.comprehensive_config
 * Controls which sections are enabled and stores section-specific data
 */
export interface ComprehensiveConfig {
  sections: {
    coverLetter: { enabled: boolean; template?: string; content?: string };
    tradeBill: { enabled: boolean; format?: "table" | "excel"; excelFileKey?: string };
    reviewForms: { enabled: boolean; templates: string[]; data?: Record<string, ReviewFormData> };
    technicalReview: { enabled: boolean; checklist?: string[]; data?: TechnicalReviewData };
    drawings: { enabled: boolean; categories?: string[]; filesByCategory?: Record<string, number[]> };
    supportingDocs: { enabled: boolean; categories?: string[]; filesByCategory?: Record<string, number[]> };
    siteRequirements: { enabled: boolean; data?: SiteRequirementsData };
    qualityCompliance: { enabled: boolean; data?: QualityComplianceData };
    customSections?: Array<{ id: string; title: string; type: string; content?: unknown }>;
  };
  timeline?: {
    enabled: boolean;
    estimatedDuration?: { value: number; unit: "days" | "weeks" | "months" };
    startDate?: string;
    endDate?: string;
    phases?: ProjectPhase[];
  };
  tradeSpecific?: {
    extractElectricalQuantities?: boolean;
    materialGradeTracking?: boolean;
    customDimensionFields?: string[];
  };
}

export interface ProjectPhase {
  id: string;
  name: string;
  description: string;
  duration: { value: number; unit: "days" | "weeks" | "months" };
  startDate?: string;
  endDate?: string;
  dependencies?: string[];
  resources?: {
    manpower?: string;
    equipment?: string[];
    materials?: string[];
  };
  lineItemIds?: number[];
  costBreakdown?: {
    labour?: number;
    materials?: number;
    equipment?: number;
    total: number;
  };
  status?: "pending" | "in_progress" | "completed";
  riskFactors?: string[];
}

export interface SiteRequirementsData {
  workingHours?: { start: string; end: string; days: string };
  accessRestrictions?: string[];
  parkingStorage?: string;
  safetyRequirements?: string[];
  permitNeeds?: string[];
  utilities?: { power?: boolean; water?: boolean; other?: string[] };
  constraints?: string[];
}

export interface QualityComplianceData {
  requiredStandards?: string[];
  certifications?: Array<{ name: string; required: boolean; providedBy?: string }>;
  inspectionPoints?: Array<{ phase: string; description: string; inspector?: string }>;
  testingSchedule?: Array<{ test: string; timing: string; responsibility: string }>;
  signOffRequirements?: string[];
}

export interface ReviewFormData {
  [key: string]: {
    question: string;
    answer: string | boolean | string[];
    notes?: string;
  };
}

export interface TechnicalReviewData {
  materialTypes?: Array<{ item: string; specification: string; grade?: string; quantity?: string }>;
  qualityAcceptance?: { standard: string; class?: string };
  specialRequirements?: string[];
  weldingSpecs?: string;
  finishingRequirements?: string;
  inspectionRequirements?: string[];
  checklist?: Array<{ item: string; status: "yes" | "no" | "n/a"; notes?: string }>;
}

export type ComprehensiveQuote = Quote & {
  comprehensiveConfig: ComprehensiveConfig;
};

// ============ SUPPORT BOT (Phase 4B Delivery E.13) ============

/**
 * Phase 4B Delivery E.13 — in-app customer support bot tables.
 * See shared/schema.ts for the canonical block; mirrored here per the
 * dual-schema rule. DDL lives in drizzle/0026_add_support_tables.sql.
 */
export const supportThreadStatusEnum = pgEnum("support_thread_status", [
  "open",
  "escalated",
  "resolved",
]);

export const supportMessageRoleEnum = pgEnum("support_message_role", [
  "user",
  "assistant",
]);

export const supportThreads = pgTable("support_threads", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  orgId: bigint("org_id", { mode: "number" }).notNull(),
  userId: bigint("user_id", { mode: "number" }).notNull(),
  status: supportThreadStatusEnum("status").default("open").notNull(),

  startPagePath: text("start_page_path"),
  lastPagePath: text("last_page_path"),

  summary: text("summary"),

  escalationContactName: varchar("escalation_contact_name", { length: 255 }),
  escalationBusinessName: varchar("escalation_business_name", { length: 255 }),
  escalationEmail: varchar("escalation_email", { length: 320 }),
  escalationPhone: varchar("escalation_phone", { length: 50 }),

  escalatedAt: timestamp("escalated_at"),
  resolvedAt: timestamp("resolved_at"),
  resolvedByUserId: bigint("resolved_by_user_id", { mode: "number" }),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type SupportThread = typeof supportThreads.$inferSelect;
export type InsertSupportThread = typeof supportThreads.$inferInsert;

export const supportMessages = pgTable("support_messages", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  threadId: bigint("thread_id", { mode: "number" }).notNull(),
  role: supportMessageRoleEnum("role").notNull(),
  content: text("content").notNull(),

  helpful: boolean("helpful"),

  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type SupportMessage = typeof supportMessages.$inferSelect;
export type InsertSupportMessage = typeof supportMessages.$inferInsert;
