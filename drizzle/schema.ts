import { serial, pgEnum, pgTable, text, timestamp, varchar, decimal, json, integer } from "drizzle-orm/pg-core";

/**
 * Enums for PostgreSQL
 */
export const roleEnum = pgEnum("role", ["user", "admin"]);
export const quoteStatusEnum = pgEnum("quote_status", ["draft", "sent", "accepted", "declined"]);
export const inputTypeEnum = pgEnum("input_type", ["pdf", "image", "audio", "email", "text"]);

/**
 * Core user table backing auth flow.
 */
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  openId: varchar("open_id", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("login_method", { length: 64 }),
  role: roleEnum("role").default("user").notNull(),
  // Company details for quotes
  companyName: varchar("company_name", { length: 255 }),
  companyAddress: text("company_address"),
  companyPhone: varchar("company_phone", { length: 50 }),
  companyEmail: varchar("company_email", { length: 320 }),
  defaultTerms: text("default_terms"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  lastSignedIn: timestamp("last_signed_in").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Quotes - the main quote entity
 * Status: draft → sent → accepted/declined
 */
export const quotes = pgTable("quotes", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  reference: varchar("reference", { length: 100 }),
  status: quoteStatusEnum("status").default("draft").notNull(),
  // Client details
  clientName: varchar("client_name", { length: 255 }),
  clientEmail: varchar("client_email", { length: 320 }),
  clientPhone: varchar("client_phone", { length: 50 }),
  clientAddress: text("client_address"),
  // Quote details
  title: varchar("title", { length: 255 }),
  description: text("description"),
  terms: text("terms"),
  validUntil: timestamp("valid_until"),
  // Totals (calculated from line items)
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
 */
export const quoteLineItems = pgTable("quote_line_items", {
  id: serial("id").primaryKey(),
  quoteId: integer("quote_id").notNull(),
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
 */
export const quoteInputs = pgTable("quote_inputs", {
  id: serial("id").primaryKey(),
  quoteId: integer("quote_id").notNull(),
  inputType: inputTypeEnum("input_type").notNull(),
  filename: varchar("filename", { length: 255 }),
  fileUrl: text("file_url"),
  fileKey: varchar("file_key", { length: 255 }),
  content: text("content"), // For text/email inputs or transcriptions
  mimeType: varchar("mime_type", { length: 100 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type QuoteInput = typeof quoteInputs.$inferSelect;
export type InsertQuoteInput = typeof quoteInputs.$inferInsert;

/**
 * Tender Context - interpretation layer for a quote
 * Stores symbol mappings, abbreviations, and confirmed meanings
 */
export const tenderContexts = pgTable("tender_contexts", {
  id: serial("id").primaryKey(),
  quoteId: integer("quote_id").notNull().unique(),
  // JSON object mapping symbols/abbreviations to meanings
  symbolMappings: json("symbol_mappings").$type<Record<string, { meaning: string; confirmed: boolean; confidence?: number }>>(),
  // Confirmed assumptions for this tender
  assumptions: json("assumptions").$type<Array<{ text: string; confirmed: boolean }>>(),
  // Exclusions explicitly noted
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
  id: serial("id").primaryKey(),
  quoteId: integer("quote_id").notNull().unique(),
  // Private notes and calculations
  notes: text("notes"),
  costBreakdown: json("cost_breakdown").$type<Array<{ item: string; cost: number; notes?: string }>>(),
  timeEstimates: json("time_estimates").$type<Array<{ task: string; hours: number; rate?: number }>>(),
  riskNotes: text("risk_notes"),
  // AI suggestions (human-reviewed before use)
  aiSuggestions: json("ai_suggestions").$type<Array<{ type: string; text: string; applied: boolean }>>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type InternalEstimate = typeof internalEstimates.$inferSelect;
export type InsertInternalEstimate = typeof internalEstimates.$inferInsert;

/**
 * Product/Service Catalog - reusable items for quotes
 */
export const catalogItems = pgTable("catalog_items", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
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
