import { serial, mysqlEnum, mysqlTable, text, timestamp, varchar, decimal, json, int, boolean, bigint } from "drizzle-orm/mysql-core";

/**
 * Organizations - multi-tenant container for all data
 * Each user belongs to an organization (auto-created on signup for solo users)
 */
export const organizations = mysqlTable("organizations", {
  id: bigint("id", { mode: "number", unsigned: true }).primaryKey().autoincrement(),
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
  aiCreditsRemaining: int("ai_credits_remaining").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type Organization = typeof organizations.$inferSelect;
export type InsertOrganization = typeof organizations.$inferInsert;

/**
 * Organization Members - links users to organizations with roles
 */
export const orgMembers = mysqlTable("org_members", {
  id: bigint("id", { mode: "number", unsigned: true }).primaryKey().autoincrement(),
  orgId: bigint("org_id", { mode: "number", unsigned: true }).notNull(),
  userId: bigint("user_id", { mode: "number", unsigned: true }).notNull(),
  role: mysqlEnum("role", ["owner", "admin", "member"]).default("member").notNull(),
  invitedAt: timestamp("invited_at").defaultNow().notNull(),
  acceptedAt: timestamp("accepted_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type OrgMember = typeof orgMembers.$inferSelect;
export type InsertOrgMember = typeof orgMembers.$inferInsert;

/**
 * Usage Logs - track AI usage for billing and analytics
 */
export const usageLogs = mysqlTable("usage_logs", {
  id: bigint("id", { mode: "number", unsigned: true }).primaryKey().autoincrement(),
  orgId: bigint("org_id", { mode: "number", unsigned: true }).notNull(),
  userId: bigint("user_id", { mode: "number", unsigned: true }).notNull(),
  actionType: varchar("action_type", { length: 50 }).notNull(),
  creditsUsed: int("credits_used").default(1).notNull(),
  metadata: json("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type UsageLog = typeof usageLogs.$inferSelect;
export type InsertUsageLog = typeof usageLogs.$inferInsert;

/**
 * Core user table backing auth flow.
 * Supports standalone email/password authentication.
 */
export const users = mysqlTable("users", {
  id: bigint("id", { mode: "number", unsigned: true }).primaryKey().autoincrement(),
  email: varchar("email", { length: 320 }).notNull().unique(),
  passwordHash: text("passwordHash").notNull(),
  name: text("name"),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  companyName: varchar("companyName", { length: 255 }),
  companyAddress: text("companyAddress"),
  companyPhone: varchar("companyPhone", { length: 50 }),
  companyEmail: varchar("companyEmail", { length: 320 }),
  defaultTerms: text("defaultTerms"),
  companyLogo: text("companyLogo"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Quotes - the main quote entity
 * Status: draft → sent → accepted/declined
 * Now owned by organization, with created_by tracking
 */
export const quotes = mysqlTable("quotes", {
  id: bigint("id", { mode: "number", unsigned: true }).primaryKey().autoincrement(),
  orgId: bigint("org_id", { mode: "number", unsigned: true }),
  userId: bigint("userId", { mode: "number", unsigned: true }).notNull(),
  createdByUserId: bigint("created_by_user_id", { mode: "number", unsigned: true }),
  reference: varchar("reference", { length: 100 }),
  status: mysqlEnum("status", ["draft", "sent", "accepted", "declined"]).default("draft").notNull(),
  clientName: varchar("clientName", { length: 255 }),
  clientEmail: varchar("clientEmail", { length: 320 }),
  clientPhone: varchar("clientPhone", { length: 50 }),
  clientAddress: text("clientAddress"),
  title: varchar("title", { length: 255 }),
  description: text("description"),
  terms: text("terms"),
  validUntil: timestamp("validUntil"),
  subtotal: decimal("subtotal", { precision: 12, scale: 2 }).default("0.00"),
  taxRate: decimal("taxRate", { precision: 5, scale: 2 }).default("0.00"),
  taxAmount: decimal("taxAmount", { precision: 12, scale: 2 }).default("0.00"),
  total: decimal("total", { precision: 12, scale: 2 }).default("0.00"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  sentAt: timestamp("sentAt"),
  acceptedAt: timestamp("acceptedAt"),
});

export type Quote = typeof quotes.$inferSelect;
export type InsertQuote = typeof quotes.$inferInsert;

/**
 * Quote Line Items - individual items on a quote
 */
export const quoteLineItems = mysqlTable("quoteLineItems", {
  id: bigint("id", { mode: "number", unsigned: true }).primaryKey().autoincrement(),
  quoteId: bigint("quoteId", { mode: "number", unsigned: true }).notNull(),
  sortOrder: int("sortOrder").default(0),
  description: text("description").notNull(),
  quantity: decimal("quantity", { precision: 12, scale: 4 }).default("1.0000"),
  unit: varchar("unit", { length: 50 }).default("each"),
  rate: decimal("rate", { precision: 12, scale: 2 }).default("0.00"),
  total: decimal("total", { precision: 12, scale: 2 }).default("0.00"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type QuoteLineItem = typeof quoteLineItems.$inferSelect;
export type InsertQuoteLineItem = typeof quoteLineItems.$inferInsert;

/**
 * Quote Inputs - raw evidence attached to a quote
 * Types: pdf, image, audio, email, text
 */
export const quoteInputs = mysqlTable("quoteInputs", {
  id: bigint("id", { mode: "number", unsigned: true }).primaryKey().autoincrement(),
  quoteId: bigint("quoteId", { mode: "number", unsigned: true }).notNull(),
  inputType: mysqlEnum("inputType", ["pdf", "image", "audio", "email", "text"]).notNull(),
  filename: varchar("filename", { length: 255 }),
  fileUrl: text("fileUrl"),
  fileKey: varchar("fileKey", { length: 255 }),
  content: text("content"),
  mimeType: varchar("mimeType", { length: 100 }),
  processedContent: text("processedContent"),
  processingStatus: varchar("processingStatus", { length: 20 }).default("pending"),
  processingError: text("processingError"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type QuoteInput = typeof quoteInputs.$inferSelect;
export type InsertQuoteInput = typeof quoteInputs.$inferInsert;

/**
 * Tender Context - interpretation layer for a quote
 * Stores symbol mappings, abbreviations, and confirmed meanings
 */
export const tenderContexts = mysqlTable("tender_contexts", {
  id: bigint("id", { mode: "number", unsigned: true }).primaryKey().autoincrement(),
  quoteId: bigint("quote_id", { mode: "number", unsigned: true }).notNull().unique(),
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
export const internalEstimates = mysqlTable("internal_estimates", {
  id: bigint("id", { mode: "number", unsigned: true }).primaryKey().autoincrement(),
  quoteId: bigint("quote_id", { mode: "number", unsigned: true }).notNull().unique(),
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
 */
export const catalogItems = mysqlTable("catalogItems", {
  id: bigint("id", { mode: "number", unsigned: true }).primaryKey().autoincrement(),
  orgId: bigint("org_id", { mode: "number", unsigned: true }),
  userId: bigint("userId", { mode: "number", unsigned: true }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  category: varchar("category", { length: 100 }),
  unit: varchar("unit", { length: 50 }).default("each"),
  defaultRate: decimal("defaultRate", { precision: 12, scale: 2 }).default("0.00"),
  costPrice: decimal("costPrice", { precision: 12, scale: 2 }),
  isActive: int("isActive").default(1),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type CatalogItem = typeof catalogItems.$inferSelect;
export type InsertCatalogItem = typeof catalogItems.$inferInsert;
