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
  }>(),
  defaultExclusions: text("default_exclusions"),
  defaultValidityDays: integer("default_validity_days").default(30),
  defaultSignatoryName: varchar("default_signatory_name", { length: 255 }),
  defaultSignatoryPosition: varchar("default_signatory_position", { length: 255 }),
  defaultSurfaceTreatment: varchar("default_surface_treatment", { length: 255 }),
  defaultReturnVisitRate: varchar("default_return_visit_rate", { length: 255 }),
  defaultPaymentTerms: text("default_payment_terms"),
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
  clientEmail: varchar("client_email", { length: 320 }),
  clientPhone: varchar("client_phone", { length: 50 }),
  clientAddress: text("client_address"),
  title: varchar("title", { length: 255 }),
  description: text("description"),
  terms: text("terms"),
  validUntil: timestamp("valid_until"),
  subtotal: decimal("subtotal", { precision: 12, scale: 2 }).default("0.00"),
  taxRate: decimal("tax_rate", { precision: 5, scale: 2 }).default("0.00"),
  taxAmount: decimal("tax_amount", { precision: 12, scale: 2 }).default("0.00"),
  total: decimal("total", { precision: 12, scale: 2 }).default("0.00"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  sentAt: timestamp("sent_at"),
  acceptedAt: timestamp("accepted_at"),
  // Comprehensive quote fields
  quoteMode: quoteModeEnum("quote_mode").default("simple").notNull(),
  tradePreset: varchar("trade_preset", { length: 50 }),
  comprehensiveConfig: json("comprehensive_config").$type<ComprehensiveConfig>(),
  userPrompt: text("user_prompt"),
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
