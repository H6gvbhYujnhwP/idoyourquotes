import { eq, desc, and } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
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
} from "../drizzle/schema";

let _db: ReturnType<typeof drizzle> | null = null;
let _client: ReturnType<typeof postgres> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _client = postgres(process.env.DATABASE_URL, { ssl: 'require' });
      _db = drizzle(_client);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
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
  
  const [user] = await db.insert(users).values({
    email: email.toLowerCase(),
    passwordHash,
    name: name || null,
    role: 'user',
    isActive: true,
  }).returning();

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
}): Promise<User | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const [user] = await db.update(users)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning();

  return user;
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

export async function getQuoteById(quoteId: number, userId: number): Promise<Quote | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(quotes)
    .where(and(eq(quotes.id, quoteId), eq(quotes.userId, userId)))
    .limit(1);

  return result[0];
}

export async function createQuote(data: Partial<InsertQuote> & { userId: number }): Promise<Quote> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [result] = await db.insert(quotes).values({
    userId: data.userId,
    reference: data.reference || `Q-${Date.now()}`,
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
