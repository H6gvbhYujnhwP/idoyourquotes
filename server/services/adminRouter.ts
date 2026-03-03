/**
 * Admin tRPC Router
 * 
 * All routes use adminProcedure — only users with role='admin' can access.
 * Provides: org listing, user details, password reset, trial management.
 *
 * Add to main router in routers.ts:
 *   import { adminRouter } from "./services/adminRouter";
 *   Then add: admin: adminRouter,
 */
import { z } from "zod";
import { router, adminProcedure } from "../_core/trpc";
import { getDb, getUserPrimaryOrg, getOrgMembersByOrgId, updateOrganization } from "../db";
import bcrypt from "bcryptjs";

const SALT_ROUNDS = 10;

export const adminRouter = router({
  /**
   * List all organisations with their owner, member count, and quote stats.
   * Supports search by org name, company name, or owner email.
   */
  listOrganizations: adminProcedure
    .input(z.object({
      search: z.string().optional(),
      page: z.number().min(1).optional().default(1),
      limit: z.number().min(1).max(100).optional().default(50),
    }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { orgs: [], total: 0 };

      const { organizations, orgMembers, users, quotes } = await import("../../drizzle/schema");
      const { eq, and, like, or, sql, desc, count } = await import("drizzle-orm");

      const page = input?.page ?? 1;
      const limit = input?.limit ?? 50;
      const offset = (page - 1) * limit;

      // Get all orgs
      let allOrgs = await db.select().from(organizations).orderBy(desc(organizations.createdAt));

      // If search term, filter
      const search = input?.search?.trim().toLowerCase();
      if (search) {
        // Get matching user IDs first
        const matchingUsers = await db.select({ id: users.id, email: users.email })
          .from(users)
          .where(
            or(
              like(users.email, `%${search}%`),
              like(users.name, `%${search}%`)
            )
          );
        const matchingUserIds = new Set(matchingUsers.map(u => Number(u.id)));

        // Get org IDs where matching users are members
        const matchingMemberships = await db.select({ orgId: orgMembers.orgId })
          .from(orgMembers)
          .where(
            sql`${orgMembers.userId} IN (${matchingUsers.length > 0 ? matchingUsers.map(u => u.id).join(',') : '0'})`
          );
        const matchingOrgIds = new Set(matchingMemberships.map(m => Number(m.orgId)));

        allOrgs = allOrgs.filter(org => {
          const orgAny = org as any;
          const nameMatch = org.name?.toLowerCase().includes(search);
          const companyMatch = orgAny.companyName?.toLowerCase().includes(search);
          const slugMatch = org.slug?.toLowerCase().includes(search);
          const orgIdMatch = matchingOrgIds.has(Number(org.id));
          return nameMatch || companyMatch || slugMatch || orgIdMatch;
        });
      }

      const total = allOrgs.length;
      const paginatedOrgs = allOrgs.slice(offset, offset + limit);

      // Enrich each org with owner info, member count, quote count
      const enriched = await Promise.all(paginatedOrgs.map(async (org) => {
        const orgAny = org as any;

        // Get members
        const members = await db.select().from(orgMembers).where(eq(orgMembers.orgId, org.id));
        
        // Get owner
        const ownerMembership = members.find(m => (m as any).role === 'owner');
        let owner = null;
        if (ownerMembership) {
          const [ownerUser] = await db.select().from(users)
            .where(eq(users.id, BigInt(ownerMembership.userId) as any)).limit(1);
          if (ownerUser) {
            owner = {
              id: Number(ownerUser.id),
              email: ownerUser.email,
              name: ownerUser.name,
              lastSignedIn: (ownerUser as any).lastSignedIn,
              createdAt: ownerUser.createdAt,
              emailVerified: (ownerUser as any).emailVerified,
              defaultTradeSector: (ownerUser as any).defaultTradeSector,
            };
          }
        }

        // Get quote count
        const orgQuotes = await db.select({ id: quotes.id }).from(quotes)
          .where(eq(quotes.orgId, org.id));

        return {
          id: Number(org.id),
          name: org.name,
          slug: org.slug,
          companyName: orgAny.companyName,
          companyEmail: orgAny.companyEmail,
          tier: orgAny.subscriptionTier || 'trial',
          status: orgAny.subscriptionStatus || 'trialing',
          cancelAtPeriodEnd: orgAny.subscriptionCancelAtPeriodEnd || false,
          trialStartsAt: orgAny.trialStartsAt,
          trialEndsAt: orgAny.trialEndsAt,
          monthlyQuoteCount: orgAny.monthlyQuoteCount || 0,
          maxQuotesPerMonth: orgAny.maxQuotesPerMonth ?? 10,
          maxUsers: orgAny.maxUsers ?? 1,
          maxCatalogItems: orgAny.maxCatalogItems ?? 50,
          currentPeriodEnd: orgAny.subscriptionCurrentPeriodEnd,
          createdAt: org.createdAt,
          totalQuotes: orgQuotes.length,
          memberCount: members.length,
          owner,
        };
      }));

      return { orgs: enriched, total };
    }),

  /**
   * Get full detail for a single org — all members, all users with full info
   */
  getOrganizationDetail: adminProcedure
    .input(z.object({ orgId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;

      const { organizations, orgMembers, users, quotes, catalogItems } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");

      const [org] = await db.select().from(organizations).where(eq(organizations.id, input.orgId)).limit(1);
      if (!org) return null;
      const orgAny = org as any;

      // Get all members with full user info
      const members = await db.select().from(orgMembers).where(eq(orgMembers.orgId, org.id));
      const memberDetails = await Promise.all(members.map(async (m) => {
        const [user] = await db.select().from(users)
          .where(eq(users.id, BigInt(m.userId) as any)).limit(1);
        return {
          membershipId: Number(m.id),
          role: (m as any).role,
          userId: Number(m.userId),
          email: user?.email || 'unknown',
          name: user?.name || null,
          lastSignedIn: (user as any)?.lastSignedIn || null,
          createdAt: user?.createdAt,
          emailVerified: (user as any)?.emailVerified || false,
          isActive: (user as any)?.isActive ?? true,
          defaultTradeSector: (user as any)?.defaultTradeSector || null,
        };
      }));

      // Get quote count
      const orgQuotes = await db.select({ id: quotes.id, status: quotes.status, createdAt: quotes.createdAt })
        .from(quotes).where(eq(quotes.orgId, org.id));

      // Get catalog item count
      const orgCatalog = await db.select({ id: catalogItems.id }).from(catalogItems)
        .where(eq(catalogItems.orgId, org.id));

      return {
        id: Number(org.id),
        name: org.name,
        slug: org.slug,
        companyName: orgAny.companyName,
        companyAddress: orgAny.companyAddress,
        companyPhone: orgAny.companyPhone,
        companyEmail: orgAny.companyEmail,
        billingEmail: orgAny.billingEmail,
        tier: orgAny.subscriptionTier || 'trial',
        status: orgAny.subscriptionStatus || 'trialing',
        cancelAtPeriodEnd: orgAny.subscriptionCancelAtPeriodEnd || false,
        stripeCustomerId: orgAny.stripeCustomerId,
        stripeSubscriptionId: orgAny.stripeSubscriptionId,
        trialStartsAt: orgAny.trialStartsAt,
        trialEndsAt: orgAny.trialEndsAt,
        currentPeriodStart: orgAny.subscriptionCurrentPeriodStart,
        currentPeriodEnd: orgAny.subscriptionCurrentPeriodEnd,
        monthlyQuoteCount: orgAny.monthlyQuoteCount || 0,
        maxQuotesPerMonth: orgAny.maxQuotesPerMonth ?? 10,
        maxUsers: orgAny.maxUsers ?? 1,
        maxCatalogItems: orgAny.maxCatalogItems ?? 50,
        createdAt: org.createdAt,
        updatedAt: orgAny.updatedAt,
        totalQuotes: orgQuotes.length,
        quotesByStatus: {
          draft: orgQuotes.filter(q => q.status === 'draft').length,
          sent: orgQuotes.filter(q => q.status === 'sent').length,
          accepted: orgQuotes.filter(q => q.status === 'accepted').length,
          declined: orgQuotes.filter(q => q.status === 'declined').length,
        },
        catalogItemCount: orgCatalog.length,
        members: memberDetails,
        dayWorkRates: orgAny.defaultDayWorkRates || null,
      };
    }),

  /**
   * Reset a user's password (admin sets a new one)
   */
  resetUserPassword: adminProcedure
    .input(z.object({
      userId: z.number(),
      newPassword: z.string().min(8, 'Password must be at least 8 characters'),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const { users } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");

      // Verify user exists
      const [user] = await db.select({ id: users.id, email: users.email })
        .from(users).where(eq(users.id, input.userId)).limit(1);
      if (!user) throw new Error("User not found");

      const newHash = await bcrypt.hash(input.newPassword, SALT_ROUNDS);
      await db.update(users)
        .set({ passwordHash: newHash, updatedAt: new Date() } as any)
        .where(eq(users.id, input.userId));

      console.log(`[Admin] Password reset for user ${input.userId} (${user.email})`);
      return { success: true };
    }),

  /**
   * Update trial end date for an org
   */
  updateTrialEnd: adminProcedure
    .input(z.object({
      orgId: z.number(),
      trialEndsAt: z.string(), // ISO date string
    }))
    .mutation(async ({ input }) => {
      await updateOrganization(input.orgId, {
        trialEndsAt: new Date(input.trialEndsAt),
      } as any);

      console.log(`[Admin] Trial end updated for org ${input.orgId} to ${input.trialEndsAt}`);
      return { success: true };
    }),

  /**
   * Update max quotes per month for an org (trial override)
   */
  updateQuotaLimit: adminProcedure
    .input(z.object({
      orgId: z.number(),
      maxQuotesPerMonth: z.number().min(0),
    }))
    .mutation(async ({ input }) => {
      await updateOrganization(input.orgId, {
        maxQuotesPerMonth: input.maxQuotesPerMonth,
      } as any);

      console.log(`[Admin] Quota updated for org ${input.orgId} to ${input.maxQuotesPerMonth} quotes/month`);
      return { success: true };
    }),

  /**
   * Get platform-wide stats (total users, orgs, quotes across all tiers)
   */
  platformStats: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return null;

    const { organizations, users, quotes } = await import("../../drizzle/schema");
    const { eq, sql } = await import("drizzle-orm");

    const allUsers = await db.select({ id: users.id }).from(users);
    const allOrgs = await db.select({
      id: organizations.id,
      tier: organizations.subscriptionTier,
      status: organizations.subscriptionStatus,
    }).from(organizations);
    const allQuotes = await db.select({ id: quotes.id }).from(quotes);

    // Count by tier
    const tierCounts: Record<string, number> = {};
    const statusCounts: Record<string, number> = {};
    for (const org of allOrgs) {
      const tier = (org as any).tier || 'trial';
      const status = (org as any).status || 'trialing';
      tierCounts[tier] = (tierCounts[tier] || 0) + 1;
      statusCounts[status] = (statusCounts[status] || 0) + 1;
    }

    return {
      totalUsers: allUsers.length,
      totalOrgs: allOrgs.length,
      totalQuotes: allQuotes.length,
      tierCounts,
      statusCounts,
    };
  }),
});
