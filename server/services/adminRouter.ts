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

      // Enrich each org with all members (with user details), quote count
      const enriched = await Promise.all(paginatedOrgs.map(async (org) => {
        const orgAny = org as any;

        // Get members with full user info
        const memberRows = await db.select().from(orgMembers).where(eq(orgMembers.orgId, org.id));
        const allMembers = await Promise.all(memberRows.map(async (m) => {
          const [user] = await db.select().from(users)
            .where(eq(users.id, BigInt(m.userId) as any)).limit(1);
          return {
            userId: Number(m.userId),
            role: (m as any).role as string,
            email: user?.email || 'unknown',
            name: user?.name || null,
            lastSignedIn: (user as any)?.lastSignedIn || null,
            createdAt: user?.createdAt || null,
            isActive: (user as any)?.isActive ?? true,
            defaultTradeSector: (user as any)?.defaultTradeSector || null,
          };
        }));

        // Sort: owner first, then admin, then member
        const roleOrder: Record<string, number> = { owner: 0, admin: 1, member: 2 };
        allMembers.sort((a, b) => (roleOrder[a.role] ?? 9) - (roleOrder[b.role] ?? 9));

        const owner = allMembers.find(m => m.role === 'owner') || null;

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
          maxCatalogItems: orgAny.maxCatalogItems ?? 100,
          currentPeriodEnd: orgAny.subscriptionCurrentPeriodEnd,
          createdAt: org.createdAt,
          totalQuotes: orgQuotes.length,
          memberCount: allMembers.length,
          members: allMembers,
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
        maxCatalogItems: orgAny.maxCatalogItems ?? 100,
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
   * Manually set subscription tier for an org (admin override — bypasses Stripe)
   * Use to fix DB/Stripe sync issues without needing shell access.
   */
  setSubscriptionTier: adminProcedure
    .input(z.object({
      orgId: z.number(),
      tier: z.enum(['trial', 'solo', 'pro', 'team']),
    }))
    .mutation(async ({ input }) => {
      const { TIER_CONFIG } = await import('./stripe');
      const config = TIER_CONFIG[input.tier];

      await updateOrganization(input.orgId, {
        subscriptionTier: input.tier,
        maxUsers: config.maxUsers,
        maxQuotesPerMonth: config.maxQuotesPerMonth,
        maxCatalogItems: config.maxCatalogItems,
      } as any);

      console.log(`[Admin] Subscription tier manually set for org ${input.orgId} → ${input.tier}`);
      return { success: true };
    }),

  /**
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

  /**
   * Delete a single user from an org (remove membership + optionally hard-delete user record).
   * Cannot delete the org owner — must delete the whole org for that.
   */
  deleteUser: adminProcedure
    .input(z.object({
      userId: z.number(),
      orgId: z.number(),
      hardDelete: z.boolean().optional().default(false),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const { orgMembers, users } = await import("../../drizzle/schema");
      const { eq, and } = await import("drizzle-orm");

      // Check membership exists
      const [membership] = await db.select().from(orgMembers)
        .where(and(eq(orgMembers.orgId, input.orgId), eq(orgMembers.userId, input.userId)))
        .limit(1);
      if (!membership) throw new Error("User is not a member of this organisation");

      // Prevent deleting the owner — must delete org instead
      if ((membership as any).role === 'owner') {
        throw new Error("Cannot delete the org owner. Use 'Delete Organisation' to remove the entire org.");
      }

      // Remove membership
      await db.delete(orgMembers)
        .where(and(eq(orgMembers.orgId, input.orgId), eq(orgMembers.userId, input.userId)));

      if (input.hardDelete) {
        // Hard delete user record
        await db.delete(users).where(eq(users.id, input.userId));
        console.log(`[Admin:DeleteUser] Hard-deleted user ${input.userId} from org ${input.orgId}`);
      } else {
        // Deactivate
        await db.update(users).set({ isActive: false } as any).where(eq(users.id, input.userId));
        console.log(`[Admin:DeleteUser] Deactivated user ${input.userId} from org ${input.orgId}`);
      }

      return { success: true, hardDeleted: input.hardDelete };
    }),

  /**
   * Delete an organisation and all its data.
   * Cancels Stripe, deletes R2 files, org data, org members, org record, deactivates users.
   * If hardDeleteUsers is true, also removes user records from DB (frees domain for new trials).
   */
  deleteOrganization: adminProcedure
    .input(z.object({
      orgId: z.number(),
      hardDeleteUsers: z.boolean().optional().default(false),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const { organizations, orgMembers, users } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const { deleteAllOrgData } = await import("../db");

      // Get org
      const [org] = await db.select().from(organizations).where(eq(organizations.id, input.orgId)).limit(1);
      if (!org) throw new Error("Organisation not found");
      const orgAny = org as any;

      console.log(`[Admin:DeleteOrg] Starting for org ${org.id} (${org.name}), hardDeleteUsers=${input.hardDeleteUsers}`);

      // 1. Cancel Stripe subscription if exists
      const stripeSubId = orgAny.stripeSubscriptionId;
      if (stripeSubId) {
        try {
          const Stripe = (await import('stripe')).default;
          const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', { apiVersion: '2025-02-24.acacia' as any });
          await stripe.subscriptions.cancel(stripeSubId);
          console.log(`[Admin:DeleteOrg] Stripe subscription ${stripeSubId} cancelled`);
        } catch (err) {
          console.error(`[Admin:DeleteOrg] Stripe cancel failed (continuing):`, err);
        }
      }

      // 2. Delete all org data (quotes, inputs, line items, takeoffs, catalog, usage logs)
      let fileKeys: string[] = [];
      let quotesDeleted = 0;
      try {
        const result = await deleteAllOrgData(org.id);
        fileKeys = result.fileKeys;
        quotesDeleted = result.quotesDeleted;
        console.log(`[Admin:DeleteOrg] Deleted ${quotesDeleted} quotes, ${fileKeys.length} file keys`);
      } catch (err) {
        console.error(`[Admin:DeleteOrg] Data deletion error:`, err);
      }

      // 3. Delete R2 files (async)
      if (fileKeys.length > 0) {
        const { deleteFromR2 } = await import('../r2Storage');
        for (const key of fileKeys) {
          deleteFromR2(key).catch(err => console.error(`[Admin:DeleteOrg] R2 delete failed: ${key}`, err));
        }
      }

      // 4. Get all member user IDs before deleting memberships
      const members = await db.select().from(orgMembers).where(eq(orgMembers.orgId, org.id));
      const memberUserIds = members.map(m => Number(m.userId));

      // 5. Delete org members
      await db.delete(orgMembers).where(eq(orgMembers.orgId, org.id));

      // 6. Handle users
      let usersDeleted = 0;
      if (input.hardDeleteUsers) {
        // Hard delete — removes user records entirely (frees domain for new trial)
        for (const userId of memberUserIds) {
          await db.delete(users).where(eq(users.id, userId));
          usersDeleted++;
        }
        console.log(`[Admin:DeleteOrg] Hard-deleted ${usersDeleted} users`);
      } else {
        // Soft delete — deactivate users (preserves anti-gaming domain check)
        for (const userId of memberUserIds) {
          await db.update(users).set({ isActive: false } as any).where(eq(users.id, userId));
        }
        console.log(`[Admin:DeleteOrg] Deactivated ${memberUserIds.length} users`);
      }

      // 7. Delete the org record itself
      await db.delete(organizations).where(eq(organizations.id, org.id));
      console.log(`[Admin:DeleteOrg] Org record deleted`);

      console.log(`[Admin:DeleteOrg] ✅ Complete — org ${org.id}, ${quotesDeleted} quotes, ${fileKeys.length} files, ${usersDeleted || memberUserIds.length} users`);

      return {
        success: true,
        quotesDeleted,
        filesQueued: fileKeys.length,
        usersAffected: memberUserIds.length,
        hardDeleted: input.hardDeleteUsers,
      };
    }),
});
