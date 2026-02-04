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
export const inputTypeEnum = pgEnum("input_type", ["pdf", "image", "audio", "email", "text"]);

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
  defaultTerms: text("default_terms"),
  billingEmail: varchar("billing_email", { length: 320 }),
  stripeCustomerId: varchar("stripe_customer_id", { length: 255 }),
  aiCreditsRemaining: integer("ai_credits_remaining").default(0),
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
