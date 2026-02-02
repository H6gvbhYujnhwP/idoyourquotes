import { eq, desc, and } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
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
} from "../drizzle/schema";
import { ENV } from './_core/env';

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

// ============ USER HELPERS ============

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    // Check if user exists
    const existing = await db.select().from(users).where(eq(users.openId, user.openId)).limit(1);
    
    if (existing.length > 0) {
      // Update existing user
      const updateData: Partial<InsertUser> = {
        lastSignedIn: new Date(),
      };
      
      if (user.name !== undefined) updateData.name = user.name;
      if (user.email !== undefined) updateData.email = user.email;
      if (user.loginMethod !== undefined) updateData.loginMethod = user.loginMethod;
      if (user.role !== undefined) updateData.role = user.role;
      
      await db.update(users).set(updateData).where(eq(users.openId, user.openId));
    } else {
      // Insert new user
      const values: InsertUser = {
        openId: user.openId,
        name: user.name ?? null,
        email: user.email ?? null,
        loginMethod: user.loginMethod ?? null,
        role: user.openId === ENV.ownerOpenId ? 'admin' : (user.role || 'user'),
        lastSignedIn: new Date(),
      };
      
      await db.insert(users).values(values);
    }
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
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
