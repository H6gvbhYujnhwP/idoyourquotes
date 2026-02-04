import { eq, desc, and } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import * as mysql from "mysql2/promise";
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
} from "../drizzle/schema";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _db: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _pool: any = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      // Parse the MySQL connection URL
      const url = new URL(process.env.DATABASE_URL);
      _pool = mysql.createPool({
        host: url.hostname,
        port: parseInt(url.port) || 4000,
        user: url.username,
        password: url.password,
        database: url.pathname.slice(1),
        ssl: { rejectUnauthorized: true },
        waitForConnections: true,
        connectionLimit: 10,
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
  
  await db.insert(organizations).values({
    name: data.name,
    slug,
    billingEmail: data.billingEmail,
    companyName: data.companyName,
    companyAddress: data.companyAddress,
    companyPhone: data.companyPhone,
    companyEmail: data.companyEmail,
  });

  // MySQL doesn't support RETURNING, so we need to fetch the inserted row
  const [result] = await db.select().from(organizations).where(eq(organizations.slug, slug)).limit(1);
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

  await db.update(organizations)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(organizations.id, orgId));

  return getOrganizationById(orgId);
}

// ============ ORG MEMBER HELPERS ============

export async function addOrgMember(orgId: number, userId: number, role: "owner" | "admin" | "member" = "member"): Promise<OrgMember> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.insert(orgMembers).values({
    orgId,
    userId,
    role,
    acceptedAt: new Date(),
  });

  const [result] = await db.select().from(orgMembers)
    .where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.userId, userId)))
    .limit(1);
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

export async function createUser(email: string, password: string, name?: string): Promise<User | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Check if user already exists
  const existing = await db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1);
  if (existing.length > 0) {
    return null; // User already exists
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  
  await db.insert(users).values({
    email: email.toLowerCase(),
    passwordHash,
    name: name || null,
    role: 'user',
    isActive: true,
  });

  // MySQL doesn't support RETURNING, fetch the inserted user
  const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1);

  // Auto-create organization for new user
  if (user) {
    const orgName = name || email.split('@')[0];
    const org = await createOrganization({
      name: orgName,
      billingEmail: email.toLowerCase(),
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

  await db.update(users)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(users.id, userId));

  return getUserById(userId);
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

  await db.insert(quotes).values({
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
  });

  // MySQL doesn't support RETURNING, fetch by reference
  const [result] = await db.select().from(quotes).where(eq(quotes.reference, reference)).limit(1);
  return result;
}

export async function updateQuote(quoteId: number, userId: number, data: Partial<InsertQuote>): Promise<Quote | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  await db.update(quotes)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(quotes.id, quoteId), eq(quotes.userId, userId)));

  return getQuoteById(quoteId, userId);
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

  await db.update(quotes)
    .set(updateData)
    .where(and(eq(quotes.id, quoteId), eq(quotes.userId, userId)));

  return getQuoteById(quoteId, userId);
}

export async function deleteQuote(quoteId: number, userId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  // Delete related records first
  await db.delete(quoteLineItems).where(eq(quoteLineItems.quoteId, quoteId));
  await db.delete(quoteInputs).where(eq(quoteInputs.quoteId, quoteId));
  await db.delete(tenderContexts).where(eq(tenderContexts.quoteId, quoteId));
  await db.delete(internalEstimates).where(eq(internalEstimates.quoteId, quoteId));

  await db.delete(quotes)
    .where(and(eq(quotes.id, quoteId), eq(quotes.userId, userId)));

  return true;
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

  await db.insert(quoteLineItems).values(data);
  
  // Fetch the last inserted item for this quote
  const [result] = await db.select().from(quoteLineItems)
    .where(eq(quoteLineItems.quoteId, data.quoteId))
    .orderBy(desc(quoteLineItems.id))
    .limit(1);
  return result;
}

export async function updateLineItem(itemId: number, data: Partial<InsertQuoteLineItem>): Promise<QuoteLineItem | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  await db.update(quoteLineItems)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(quoteLineItems.id, itemId));

  const [result] = await db.select().from(quoteLineItems).where(eq(quoteLineItems.id, itemId)).limit(1);
  return result;
}

export async function deleteLineItem(itemId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  await db.delete(quoteLineItems).where(eq(quoteLineItems.id, itemId));
  return true;
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

  await db.insert(quoteInputs).values(data);
  
  // Fetch the last inserted input for this quote
  const [result] = await db.select().from(quoteInputs)
    .where(eq(quoteInputs.quoteId, data.quoteId))
    .orderBy(desc(quoteInputs.id))
    .limit(1);
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

  await db.update(quoteInputs)
    .set(data)
    .where(eq(quoteInputs.id, inputId));

  const [result] = await db.select().from(quoteInputs).where(eq(quoteInputs.id, inputId)).limit(1);
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
    await db.update(tenderContexts)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(tenderContexts.quoteId, quoteId));
  } else {
    await db.insert(tenderContexts).values({ quoteId, ...data });
  }

  const result = await getTenderContextByQuoteId(quoteId);
  return result!;
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
    await db.update(internalEstimates)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(internalEstimates.quoteId, quoteId));
  } else {
    await db.insert(internalEstimates).values({ quoteId, ...data });
  }

  const result = await getInternalEstimateByQuoteId(quoteId);
  return result!;
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

  await db.insert(catalogItems).values(data);
  
  // Fetch the last inserted catalog item for this user
  const [result] = await db.select().from(catalogItems)
    .where(eq(catalogItems.userId, data.userId))
    .orderBy(desc(catalogItems.id))
    .limit(1);
  return result;
}

export async function updateCatalogItem(itemId: number, userId: number, data: Partial<InsertCatalogItem>): Promise<CatalogItem | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  await db.update(catalogItems)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(catalogItems.id, itemId), eq(catalogItems.userId, userId)));
  
  const [result] = await db.select().from(catalogItems).where(eq(catalogItems.id, itemId)).limit(1);
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
