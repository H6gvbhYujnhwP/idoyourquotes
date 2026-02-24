import { eq, desc, and } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import bcrypt from "bcryptjs";
import { 
  InsertUser, 
  users, 
  quotes, 
  quoteLineItems, 
  quoteInputs, 
  tenderContexts, 
  internalEstimates,
  catalogItems,
  organizations,
  orgMembers,
  usageLogs,
  Quote,
  InsertQuote,
  QuoteLineItem,
  InsertQuoteLineItem,
  QuoteInput,
  InsertQuoteInput,
  TenderContext,
  InsertTenderContext,
  InternalEstimate,
  InsertInternalEstimate,
  CatalogItem,
  InsertCatalogItem,
  User,
  Organization,
  InsertOrganization,
  OrgMember,
  InsertOrgMember,
  UsageLog,
  InsertUsageLog,
  electricalTakeoffs,
  ElectricalTakeoff,
  InsertElectricalTakeoff,
  containmentTakeoffs,
  ContainmentTakeoff,
  InsertContainmentTakeoff,
} from "../drizzle/schema";

/**
 * IMPORTANT: IdoYourQuotes uses PostgreSQL on Render
 * Database: idoyourquotes-db (PostgreSQL 16)
 * DO NOT change to MySQL/TiDB
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _db: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _pool: any = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _pool = new pg.Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
      });
      _db = drizzle(_pool);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ============ ORGANIZATION HELPERS ============

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50) + '-' + Date.now().toString(36);
}

export async function createOrganization(data: {
  name: string;
  billingEmail?: string;
  companyName?: string;
  companyAddress?: string;
  companyPhone?: string;
  companyEmail?: string;
}): Promise<Organization> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const slug = generateSlug(data.name);
  
  const [result] = await db.insert(organizations).values({
    name: data.name,
    slug,
    billingEmail: data.billingEmail,
    companyName: data.companyName,
    companyAddress: data.companyAddress,
    companyPhone: data.companyPhone,
    companyEmail: data.companyEmail,
  }).returning();

  return result;
}

export async function getOrganizationById(orgId: number): Promise<Organization | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const [result] = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
  return result;
}

export async function getOrganizationBySlug(slug: string): Promise<Organization | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const [result] = await db.select().from(organizations).where(eq(organizations.slug, slug)).limit(1);
  return result;
}

export async function updateOrganization(orgId: number, data: Partial<InsertOrganization>): Promise<Organization | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const [result] = await db.update(organizations)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(organizations.id, orgId))
    .returning();

  return result;
}

// ============ ORG MEMBER HELPERS ============

export async function addOrgMember(orgId: number, userId: number, role: "owner" | "admin" | "member" = "member"): Promise<OrgMember> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [result] = await db.insert(orgMembers).values({
    orgId,
    userId,
    role,
    acceptedAt: new Date(),
  }).returning();

  return result;
}

export async function getOrgMembersByOrgId(orgId: number): Promise<OrgMember[]> {
  const db = await getDb();
  if (!db) return [];

  return db.select().from(orgMembers).where(eq(orgMembers.orgId, orgId));
}

export async function getUserOrganizations(userId: number): Promise<Organization[]> {
  const db = await getDb();
  if (!db) return [];

  const memberships = await db.select().from(orgMembers).where(eq(orgMembers.userId, userId));
  if (memberships.length === 0) return [];

  const orgIds = memberships.map((m: OrgMember) => m.orgId);
  // Fetch organizations one by one (simple approach for now)
  const orgs: Organization[] = [];
  for (const orgId of orgIds) {
    const org = await getOrganizationById(orgId);
    if (org) orgs.push(org);
  }
  return orgs;
}

export async function getUserPrimaryOrg(userId: number): Promise<Organization | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  // Get the first org where user is owner, or any org they belong to
  const [membership] = await db.select().from(orgMembers)
    .where(eq(orgMembers.userId, userId))
    .orderBy(orgMembers.createdAt)
    .limit(1);

  if (!membership) return undefined;
  return getOrganizationById(membership.orgId);
}

// ============ USAGE LOG HELPERS ============

export async function logUsage(data: {
  orgId: number;
  userId: number;
  actionType: string;
  creditsUsed?: number;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db.insert(usageLogs).values({
    orgId: data.orgId,
    userId: data.userId,
    actionType: data.actionType,
    creditsUsed: data.creditsUsed || 1,
    metadata: data.metadata,
  });
}

export async function getUsageByOrgId(orgId: number, limit = 100): Promise<UsageLog[]> {
  const db = await getDb();
  if (!db) return [];

  return db.select().from(usageLogs)
    .where(eq(usageLogs.orgId, orgId))
    .orderBy(desc(usageLogs.createdAt))
    .limit(limit);
}

// ============ USER AUTHENTICATION HELPERS ============

const SALT_ROUNDS = 12;

export async function createUser(email: string, password: string, name?: string, companyName?: string, defaultTradeSector?: string): Promise<User | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Check if user already exists
  const existing = await db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1);
  if (existing.length > 0) {
    return null; // User already exists
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  
  const [user] = await db.insert(users).values({
    email: email.toLowerCase(),
    passwordHash,
    name: name || null,
    companyName: companyName || null,
    defaultTradeSector: defaultTradeSector || null,
    role: 'user',
    isActive: true,
  }).returning();

  // Auto-create organization for new user
  // Priority: companyName > name > email prefix
  if (user) {
    const orgName = companyName || name || email.split('@')[0];
    const org = await createOrganization({
      name: orgName,
      billingEmail: email.toLowerCase(),
      companyName: companyName || undefined,
    });
    await addOrgMember(org.id, user.id, "owner");
  }

  return user;
}

export async function authenticateUser(email: string, password: string): Promise<User | null> {
  const db = await getDb();
  if (!db) return null;

  const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1);
  
  if (!user || !user.isActive) {
    return null;
  }

  const isValid = await bcrypt.compare(password, user.passwordHash);
  if (!isValid) {
    return null;
  }

  // Update last signed in
  await db.update(users).set({ lastSignedIn: new Date() }).where(eq(users.id, user.id));

  return user;
}

export async function getUserById(userId: number): Promise<User | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return user;
}

export async function getUserByEmail(email: string): Promise<User | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1);
  return user;
}

export async function updateUserProfile(userId: number, data: {
  name?: string;
  companyName?: string;
  companyAddress?: string;
  companyPhone?: string;
  companyEmail?: string;
  defaultTerms?: string;
  companyLogo?: string;
}): Promise<User | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const [result] = await db.update(users)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning();

  return result;
}

export async function changePassword(userId: number, currentPassword: string, newPassword: string): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  const user = await getUserById(userId);
  if (!user) return false;

  const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!isValid) return false;

  const newHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  await db.update(users).set({ passwordHash: newHash, updatedAt: new Date() }).where(eq(users.id, userId));

  return true;
}

// ============ QUOTE HELPERS ============

export async function getQuotesByUserId(userId: number): Promise<Quote[]> {
  const db = await getDb();
  if (!db) return [];

  return db.select().from(quotes).where(eq(quotes.userId, userId)).orderBy(desc(quotes.updatedAt));
}

export async function getQuotesByOrgId(orgId: number): Promise<Quote[]> {
  const db = await getDb();
  if (!db) return [];

  return db.select().from(quotes).where(eq(quotes.orgId, orgId)).orderBy(desc(quotes.updatedAt));
}

export async function getQuoteById(quoteId: number, userId: number): Promise<Quote | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(quotes)
    .where(and(eq(quotes.id, quoteId), eq(quotes.userId, userId)))
    .limit(1);

  return result[0];
}

export async function getQuoteByIdAndOrg(quoteId: number, orgId: number): Promise<Quote | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(quotes)
    .where(and(eq(quotes.id, quoteId), eq(quotes.orgId, orgId)))
    .limit(1);

  return result[0];
}

export async function createQuote(data: Partial<InsertQuote> & { userId: number; orgId?: number }): Promise<Quote> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const reference = data.reference || `Q-${Date.now()}`;

  const [result] = await db.insert(quotes).values({
    userId: data.userId,
    orgId: data.orgId,
    createdByUserId: data.userId,
    reference,
    status: data.status || "draft",
    clientName: data.clientName,
    clientEmail: data.clientEmail,
    clientPhone: data.clientPhone,
    clientAddress: data.clientAddress,
    title: data.title,
    description: data.description,
    terms: data.terms,
    validUntil: data.validUntil,
    subtotal: data.subtotal || "0.00",
    taxRate: data.taxRate || "0.00",
    taxAmount: data.taxAmount || "0.00",
    total: data.total || "0.00",
    quoteMode: data.quoteMode || "simple",
    tradePreset: data.tradePreset,
    comprehensiveConfig: data.comprehensiveConfig,
  }).returning();

  return result;
}

export async function updateQuote(quoteId: number, userId: number, data: Partial<InsertQuote>): Promise<Quote | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const [result] = await db.update(quotes)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(quotes.id, quoteId), eq(quotes.userId, userId)))
    .returning();

  return result;
}

export async function updateQuoteStatus(
  quoteId: number, 
  userId: number, 
  status: "draft" | "sent" | "accepted" | "declined"
): Promise<Quote | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const updateData: Record<string, unknown> = {
    status,
    updatedAt: new Date(),
  };

  // Set timestamps based on status transition
  if (status === "sent") {
    updateData.sentAt = new Date();
  } else if (status === "accepted") {
    updateData.acceptedAt = new Date();
  }

  const [result] = await db.update(quotes)
    .set(updateData)
    .where(and(eq(quotes.id, quoteId), eq(quotes.userId, userId)))
    .returning();

  return result;
}

export async function deleteQuote(quoteId: number, userId: number): Promise<{ success: boolean; deletedFiles: string[] }> {
  const db = await getDb();
  if (!db) return { success: false, deletedFiles: [] };

  // Get all inputs with file keys before deleting
  const inputs = await db.select().from(quoteInputs)
    .where(eq(quoteInputs.quoteId, quoteId));
  
  // Collect file keys to delete from storage
  const fileKeys: string[] = inputs
    .filter((input: QuoteInput) => input.fileKey)
    .map((input: QuoteInput) => input.fileKey as string);

  // Delete related records first
  await db.delete(quoteLineItems).where(eq(quoteLineItems.quoteId, quoteId));
  await db.delete(quoteInputs).where(eq(quoteInputs.quoteId, quoteId));
  await db.delete(tenderContexts).where(eq(tenderContexts.quoteId, quoteId));
  await db.delete(internalEstimates).where(eq(internalEstimates.quoteId, quoteId));

  await db.delete(quotes)
    .where(and(eq(quotes.id, quoteId), eq(quotes.userId, userId)));

  return { success: true, deletedFiles: fileKeys };
}

/**
 * Duplicate a quote with all its related data (line items, tender context, internal estimate)
 * Does NOT copy input files - they are tied to the original tender documents
 * @param quoteId - The ID of the quote to duplicate
 * @param userId - The user ID performing the duplication
 * @param orgId - Optional organization ID for the new quote
 * @returns The newly created quote
 */
export async function duplicateQuote(
  quoteId: number,
  userId: number,
  orgId?: number
): Promise<Quote> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Get the original quote
  const [originalQuote] = await db.select().from(quotes)
    .where(eq(quotes.id, quoteId))
    .limit(1);

  if (!originalQuote) {
    throw new Error("Quote not found");
  }

  // Generate new reference number
  const newReference = `Q-${Date.now()}`;

  // Create the new quote with copied data
  const [newQuote] = await db.insert(quotes).values({
    userId,
    orgId: orgId || originalQuote.orgId,
    createdByUserId: userId,
    reference: newReference,
    status: "draft", // Always reset to draft
    clientName: originalQuote.clientName,
    clientEmail: originalQuote.clientEmail,
    clientPhone: originalQuote.clientPhone,
    clientAddress: originalQuote.clientAddress,
    title: originalQuote.title ? `${originalQuote.title} (Copy)` : null,
    description: originalQuote.description,
    terms: originalQuote.terms,
    validUntil: null, // Don't copy validity date
    subtotal: originalQuote.subtotal,
    taxRate: originalQuote.taxRate,
    taxAmount: originalQuote.taxAmount,
    total: originalQuote.total,
    quoteMode: originalQuote.quoteMode,
    tradePreset: originalQuote.tradePreset,
    comprehensiveConfig: originalQuote.comprehensiveConfig,
  }).returning();

  // Copy line items
  const lineItems = await db.select().from(quoteLineItems)
    .where(eq(quoteLineItems.quoteId, quoteId))
    .orderBy(quoteLineItems.sortOrder);

  if (lineItems.length > 0) {
    const newLineItems = lineItems.map((item: QuoteLineItem) => ({
      quoteId: newQuote.id,
      sortOrder: item.sortOrder,
      description: item.description,
      quantity: item.quantity,
      unit: item.unit,
      rate: item.rate,
      total: item.total,
      phaseId: item.phaseId,
      category: item.category,
    }));
    await db.insert(quoteLineItems).values(newLineItems);
  }

  // Copy tender context if exists
  const [tenderContext] = await db.select().from(tenderContexts)
    .where(eq(tenderContexts.quoteId, quoteId))
    .limit(1);

  if (tenderContext) {
    await db.insert(tenderContexts).values({
      quoteId: newQuote.id,
      symbolMappings: tenderContext.symbolMappings,
      assumptions: tenderContext.assumptions,
      exclusions: tenderContext.exclusions,
      notes: tenderContext.notes,
    });
  }

  // Copy internal estimate if exists
  const [internalEstimate] = await db.select().from(internalEstimates)
    .where(eq(internalEstimates.quoteId, quoteId))
    .limit(1);

  if (internalEstimate) {
    await db.insert(internalEstimates).values({
      quoteId: newQuote.id,
      notes: internalEstimate.notes,
      costBreakdown: internalEstimate.costBreakdown,
      timeEstimates: internalEstimate.timeEstimates,
      riskNotes: internalEstimate.riskNotes,
      aiSuggestions: internalEstimate.aiSuggestions,
    });
  }

  // NOTE: Input files are NOT copied - they are tied to the original tender documents

  return newQuote;
}

// ============ LINE ITEM HELPERS ============

export async function getLineItemsByQuoteId(quoteId: number): Promise<QuoteLineItem[]> {
  const db = await getDb();
  if (!db) return [];

  return db.select().from(quoteLineItems)
    .where(eq(quoteLineItems.quoteId, quoteId))
    .orderBy(quoteLineItems.sortOrder);
}

export async function createLineItem(data: InsertQuoteLineItem): Promise<QuoteLineItem> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [result] = await db.insert(quoteLineItems).values(data).returning();
  return result;
}

export async function updateLineItem(itemId: number, data: Partial<InsertQuoteLineItem>): Promise<QuoteLineItem | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const [result] = await db.update(quoteLineItems)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(quoteLineItems.id, itemId))
    .returning();

  return result;
}

export async function deleteLineItem(itemId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  await db.delete(quoteLineItems).where(eq(quoteLineItems.id, itemId));
  return true;
}

export async function deleteLineItemsByQuoteId(quoteId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db.delete(quoteLineItems).where(eq(quoteLineItems.quoteId, quoteId));
}

// ============ QUOTE INPUT HELPERS ============

export async function getInputsByQuoteId(quoteId: number): Promise<QuoteInput[]> {
  const db = await getDb();
  if (!db) return [];

  return db.select().from(quoteInputs)
    .where(eq(quoteInputs.quoteId, quoteId))
    .orderBy(desc(quoteInputs.createdAt));
}

export async function createInput(data: InsertQuoteInput): Promise<QuoteInput> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [result] = await db.insert(quoteInputs).values(data).returning();
  return result;
}

export async function deleteInput(inputId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  await db.delete(quoteInputs).where(eq(quoteInputs.id, inputId));
  return true;
}

export async function updateInputProcessing(
  inputId: number,
  data: {
    processedContent?: string | null;
    processingStatus?: string;
    processingError?: string | null;
  }
): Promise<QuoteInput | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const [result] = await db.update(quoteInputs)
    .set(data)
    .where(eq(quoteInputs.id, inputId))
    .returning();

  return result;
}

export async function updateInputContent(
  inputId: number,
  content: string,
): Promise<QuoteInput | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const [result] = await db.update(quoteInputs)
    .set({ content })
    .where(eq(quoteInputs.id, inputId))
    .returning();

  return result;
}

export async function getInputById(inputId: number): Promise<QuoteInput | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const [result] = await db.select().from(quoteInputs)
    .where(eq(quoteInputs.id, inputId))
    .limit(1);
  return result;
}

// ============ TENDER CONTEXT HELPERS ============

export async function getTenderContextByQuoteId(quoteId: number): Promise<TenderContext | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(tenderContexts)
    .where(eq(tenderContexts.quoteId, quoteId))
    .limit(1);

  return result[0];
}

export async function upsertTenderContext(quoteId: number, data: Partial<InsertTenderContext>): Promise<TenderContext> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const existing = await getTenderContextByQuoteId(quoteId);
  
  if (existing) {
    const [result] = await db.update(tenderContexts)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(tenderContexts.quoteId, quoteId))
      .returning();
    return result;
  } else {
    const [result] = await db.insert(tenderContexts).values({ quoteId, ...data }).returning();
    return result;
  }
}

// ============ INTERNAL ESTIMATE HELPERS ============

export async function getInternalEstimateByQuoteId(quoteId: number): Promise<InternalEstimate | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(internalEstimates)
    .where(eq(internalEstimates.quoteId, quoteId))
    .limit(1);

  return result[0];
}

export async function upsertInternalEstimate(quoteId: number, data: Partial<InsertInternalEstimate>): Promise<InternalEstimate> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const existing = await getInternalEstimateByQuoteId(quoteId);
  
  if (existing) {
    const [result] = await db.update(internalEstimates)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(internalEstimates.quoteId, quoteId))
      .returning();
    return result;
  } else {
    const [result] = await db.insert(internalEstimates).values({ quoteId, ...data }).returning();
    return result;
  }
}

// ============ CATALOG HELPERS ============

export async function getCatalogItemsByUserId(userId: number): Promise<CatalogItem[]> {
  const db = await getDb();
  if (!db) return [];

  return db.select().from(catalogItems)
    .where(eq(catalogItems.userId, userId))
    .orderBy(catalogItems.name);
}

export async function getCatalogItemsByOrgId(orgId: number): Promise<CatalogItem[]> {
  const db = await getDb();
  if (!db) return [];

  return db.select().from(catalogItems)
    .where(eq(catalogItems.orgId, orgId))
    .orderBy(catalogItems.name);
}

export async function createCatalogItem(data: InsertCatalogItem): Promise<CatalogItem> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [result] = await db.insert(catalogItems).values(data).returning();
  return result;
}

export async function updateCatalogItem(itemId: number, userId: number, data: Partial<InsertCatalogItem>): Promise<CatalogItem | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const [result] = await db.update(catalogItems)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(catalogItems.id, itemId), eq(catalogItems.userId, userId)))
    .returning();
  
  return result;
}

export async function deleteCatalogItem(itemId: number, userId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  await db.delete(catalogItems)
    .where(and(eq(catalogItems.id, itemId), eq(catalogItems.userId, userId)));
  return true;
}

// ============ QUOTE TOTALS HELPER ============

export async function recalculateQuoteTotals(quoteId: number, userId: number): Promise<Quote | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const lineItems = await getLineItemsByQuoteId(quoteId);
  const quote = await getQuoteById(quoteId, userId);
  
  if (!quote) return undefined;

  const subtotal = lineItems.reduce((sum, item) => sum + parseFloat(item.total || "0"), 0);
  const taxRate = parseFloat(quote.taxRate || "0");
  const taxAmount = subtotal * (taxRate / 100);
  const total = subtotal + taxAmount;

  return updateQuote(quoteId, userId, {
    subtotal: subtotal.toFixed(2),
    taxAmount: taxAmount.toFixed(2),
    total: total.toFixed(2),
  });
}

// ============ MIGRATION HELPER ============

/**
 * Migrate existing users to have organizations
 * Run this once to create orgs for existing users
 */
export async function migrateExistingUsersToOrgs(): Promise<void> {
  const db = await getDb();
  if (!db) return;

  // Get all users
  const allUsers = await db.select().from(users);
  
  for (const user of allUsers) {
    // Check if user already has an org
    const existingOrgs = await getUserOrganizations(user.id);
    if (existingOrgs.length > 0) continue;

    // Create org for user
    const orgName = user.name || user.email.split('@')[0];
    const org = await createOrganization({
      name: orgName,
      billingEmail: user.email,
      companyName: user.companyName || undefined,
      companyAddress: user.companyAddress || undefined,
      companyPhone: user.companyPhone || undefined,
      companyEmail: user.companyEmail || undefined,
    });
    await addOrgMember(org.id, user.id, "owner");

    // Update user's quotes to belong to this org
    await db.update(quotes)
      .set({ orgId: org.id })
      .where(eq(quotes.userId, user.id));

    // Update user's catalog items to belong to this org
    await db.update(catalogItems)
      .set({ orgId: org.id })
      .where(eq(catalogItems.userId, user.id));

    console.log(`[Migration] Created org "${org.name}" for user ${user.email}`);
  }
}

// ============ ELECTRICAL TAKEOFF HELPERS ============

export async function createElectricalTakeoff(data: InsertElectricalTakeoff): Promise<ElectricalTakeoff> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [result] = await db.insert(electricalTakeoffs).values(data).returning();
  return result;
}

export async function getElectricalTakeoffsByQuoteId(quoteId: number): Promise<ElectricalTakeoff[]> {
  const db = await getDb();
  if (!db) return [];

  return db.select().from(electricalTakeoffs)
    .where(eq(electricalTakeoffs.quoteId, quoteId))
    .orderBy(desc(electricalTakeoffs.createdAt));
}

export async function getElectricalTakeoffById(id: number): Promise<ElectricalTakeoff | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const [result] = await db.select().from(electricalTakeoffs)
    .where(eq(electricalTakeoffs.id, id))
    .limit(1);
  return result;
}

export async function getElectricalTakeoffByInputId(inputId: number): Promise<ElectricalTakeoff | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const [result] = await db.select().from(electricalTakeoffs)
    .where(eq(electricalTakeoffs.inputId, inputId))
    .limit(1);
  return result;
}

export async function updateElectricalTakeoff(
  id: number,
  data: Partial<InsertElectricalTakeoff>
): Promise<ElectricalTakeoff | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const [result] = await db.update(electricalTakeoffs)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(electricalTakeoffs.id, id))
    .returning();
  return result;
}

// ---- Containment Takeoffs ----

export async function createContainmentTakeoff(data: InsertContainmentTakeoff): Promise<ContainmentTakeoff> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [result] = await db.insert(containmentTakeoffs).values(data).returning();
  return result;
}

export async function getContainmentTakeoffsByQuoteId(quoteId: number): Promise<ContainmentTakeoff[]> {
  const db = await getDb();
  if (!db) return [];

  return db.select().from(containmentTakeoffs)
    .where(eq(containmentTakeoffs.quoteId, quoteId))
    .orderBy(desc(containmentTakeoffs.createdAt));
}

export async function getContainmentTakeoffById(id: number): Promise<ContainmentTakeoff | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const [result] = await db.select().from(containmentTakeoffs)
    .where(eq(containmentTakeoffs.id, id))
    .limit(1);
  return result;
}

export async function getContainmentTakeoffByInputId(inputId: number): Promise<ContainmentTakeoff | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const [result] = await db.select().from(containmentTakeoffs)
    .where(eq(containmentTakeoffs.inputId, inputId))
    .limit(1);
  return result;
}

export async function updateContainmentTakeoff(
  id: number,
  data: Partial<InsertContainmentTakeoff>
): Promise<ContainmentTakeoff | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const [result] = await db.update(containmentTakeoffs)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(containmentTakeoffs.id, id))
    .returning();
  return result;
}
