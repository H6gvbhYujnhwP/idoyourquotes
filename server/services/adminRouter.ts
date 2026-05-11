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

  // ─── Support bot conversations (Phase 4B Delivery E.13) ──────────
  //
  // Admin-only views over the support_threads / support_messages
  // tables. Read-only listing + single-thread fetch + a status flip
  // to "resolved" so an admin can clear a ticket out of the open
  // queue once they've replied to the customer over email.

  /**
   * List support threads for the admin Conversations view. Filterable
   * by status, paginated. Returns the thread row plus a small
   * preview: the first user message and the last message of any role.
   */
  listSupportThreads: adminProcedure
    .input(
      z.object({
        status: z.enum(["all", "open", "escalated", "resolved"]).optional().default("all"),
        page: z.number().min(1).optional().default(1),
        limit: z.number().min(1).max(100).optional().default(50),
      }).optional(),
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { threads: [], total: 0 };

      const { eq, desc, sql, and } = await import("drizzle-orm");
      const { supportThreads, supportMessages, organizations, users } = await import(
        "../../shared/schema"
      );

      const status = input?.status ?? "all";
      const page = input?.page ?? 1;
      const limit = input?.limit ?? 50;
      const offset = (page - 1) * limit;

      const whereClause = status === "all" ? undefined : eq(supportThreads.status, status);

      // Total count for pagination
      const [{ total }] = await db
        .select({ total: sql<number>`COUNT(*)::int` })
        .from(supportThreads)
        .where(whereClause as any);

      // Page of threads with org + user info joined in
      const rows = await db
        .select({
          id: supportThreads.id,
          orgId: supportThreads.orgId,
          userId: supportThreads.userId,
          status: supportThreads.status,
          startPagePath: supportThreads.startPagePath,
          lastPagePath: supportThreads.lastPagePath,
          summary: supportThreads.summary,
          escalationContactName: supportThreads.escalationContactName,
          escalationBusinessName: supportThreads.escalationBusinessName,
          escalationEmail: supportThreads.escalationEmail,
          escalationPhone: supportThreads.escalationPhone,
          escalatedAt: supportThreads.escalatedAt,
          resolvedAt: supportThreads.resolvedAt,
          createdAt: supportThreads.createdAt,
          updatedAt: supportThreads.updatedAt,
          orgName: organizations.name,
          orgCompanyName: organizations.companyName,
          orgTier: organizations.subscriptionTier,
          userEmail: users.email,
          userName: users.name,
        })
        .from(supportThreads)
        .leftJoin(organizations, eq(supportThreads.orgId, organizations.id))
        .leftJoin(users, eq(supportThreads.userId, users.id))
        .where(whereClause as any)
        .orderBy(desc(supportThreads.updatedAt))
        .limit(limit)
        .offset(offset);

      // Pull message counts and last-message previews per thread.
      // Done in one extra query rather than N+1.
      type ThreadRow = (typeof rows)[number];
      const threadIds = rows.map((r: ThreadRow) => r.id);
      type Counts = Record<number, { msgCount: number; lastContent: string | null }>;
      let counts: Counts = {};
      if (threadIds.length > 0) {
        const inList = sql.raw(threadIds.join(","));
        const countRows: Array<{
          threadId: number;
          msgCount: number;
          lastContent: string | null;
        }> = await db.execute(sql`
          SELECT
            sm.thread_id AS "threadId",
            COUNT(*)::int AS "msgCount",
            (
              SELECT content
              FROM support_messages
              WHERE thread_id = sm.thread_id
              ORDER BY created_at DESC
              LIMIT 1
            ) AS "lastContent"
          FROM support_messages sm
          WHERE sm.thread_id IN (${inList})
          GROUP BY sm.thread_id
        `) as any;
        counts = countRows.reduce<Counts>((acc, r) => {
          acc[r.threadId] = { msgCount: r.msgCount, lastContent: r.lastContent };
          return acc;
        }, {});
      }

      const threads = rows.map((r: ThreadRow) => ({
        ...r,
        messageCount: counts[r.id]?.msgCount ?? 0,
        lastMessagePreview:
          counts[r.id]?.lastContent && counts[r.id].lastContent!.length > 200
            ? counts[r.id].lastContent!.slice(0, 200) + "…"
            : counts[r.id]?.lastContent ?? null,
      }));

      return { threads, total, page, limit };
    }),

  /**
   * Fetch a single thread with its full message list. Org info and
   * user info are joined in for the back-office panel header.
   */
  getSupportThread: adminProcedure
    .input(z.object({ threadId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");

      const { eq, asc } = await import("drizzle-orm");
      const { supportThreads, supportMessages, organizations, users } = await import(
        "../../shared/schema"
      );

      const [thread] = await db
        .select({
          id: supportThreads.id,
          orgId: supportThreads.orgId,
          userId: supportThreads.userId,
          status: supportThreads.status,
          startPagePath: supportThreads.startPagePath,
          lastPagePath: supportThreads.lastPagePath,
          summary: supportThreads.summary,
          escalationContactName: supportThreads.escalationContactName,
          escalationBusinessName: supportThreads.escalationBusinessName,
          escalationEmail: supportThreads.escalationEmail,
          escalationPhone: supportThreads.escalationPhone,
          escalatedAt: supportThreads.escalatedAt,
          resolvedAt: supportThreads.resolvedAt,
          createdAt: supportThreads.createdAt,
          updatedAt: supportThreads.updatedAt,
          orgName: organizations.name,
          orgCompanyName: organizations.companyName,
          orgCompanyEmail: organizations.companyEmail,
          orgCompanyPhone: organizations.companyPhone,
          orgTier: organizations.subscriptionTier,
          userEmail: users.email,
          userName: users.name,
          userSector: users.defaultTradeSector,
        })
        .from(supportThreads)
        .leftJoin(organizations, eq(supportThreads.orgId, organizations.id))
        .leftJoin(users, eq(supportThreads.userId, users.id))
        .where(eq(supportThreads.id, input.threadId))
        .limit(1);

      if (!thread) throw new Error("Thread not found");

      const messages = await db
        .select()
        .from(supportMessages)
        .where(eq(supportMessages.threadId, thread.id))
        .orderBy(asc(supportMessages.createdAt));

      return { thread, messages };
    }),

  /**
   * Mark a thread resolved from the admin view. Captures the admin
   * user's id on the row so we know who closed it.
   */
  markSupportThreadResolved: adminProcedure
    .input(
      z.object({
        threadId: z.number(),
        resolved: z.boolean().default(true),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");

      const { eq } = await import("drizzle-orm");
      const { supportThreads } = await import("../../shared/schema");

      // Re-opening simply moves it back to escalated (since most
      // resolved threads got there via escalate). If the thread was
      // never escalated, re-open as 'open'.
      if (!input.resolved) {
        const [existing] = await db
          .select()
          .from(supportThreads)
          .where(eq(supportThreads.id, input.threadId))
          .limit(1);
        if (!existing) throw new Error("Thread not found");

        const reopenStatus = existing.escalatedAt ? "escalated" : "open";
        await db
          .update(supportThreads)
          .set({
            status: reopenStatus,
            resolvedAt: null,
            resolvedByUserId: null,
            updatedAt: new Date(),
          })
          .where(eq(supportThreads.id, input.threadId));
        return { ok: true, status: reopenStatus };
      }

      await db
        .update(supportThreads)
        .set({
          status: "resolved",
          resolvedAt: new Date(),
          resolvedByUserId: ctx.user.id,
          updatedAt: new Date(),
        })
        .where(eq(supportThreads.id, input.threadId));

      return { ok: true, status: "resolved" };
    }),

  // ──────────────────────────────────────────────────────────────────────────
  //  Quote inspector + catalog diff (added for the admin panel polish session)
  //
  //  All three procedures below are READ-ONLY and additive. They do not modify
  //  any existing data and are not depended on by any non-admin code path —
  //  customer-facing flows (QuoteWorkspace, brochure pipeline, PDF rendering,
  //  email scheduling, Stripe) cannot be affected by changes here.
  //
  //  - getOrgQuotes:    paginated quote list for one org. Used by the new
  //                     "Quotes" tab on the org detail view.
  //  - getQuoteDetail:  full inspection of a single quote — inputs (text/voice/
  //                     photo/document/email), line items with stock/modified/
  //                     added/adhoc source matching against the org's catalog
  //                     and the sector seed, AI draft fields (userPrompt,
  //                     processingInstructions, comprehensiveConfig), and the
  //                     finalised assumptions/terms.
  //  - getOrgCatalog:   the org's full catalog with each item categorised
  //                     against the seed (stock/modified/added/disabled),
  //                     with the diff value attached for modified rows.
  //
  //  Source-matching strategy: the `quote_line_items.item_name` column links a
  //  generated line item to a `catalog_items.name` in the org's catalog. The
  //  org's owner's `defaultTradeSector` then identifies which seed to compare
  //  against. Edge case: if a user renames a seed item, that item's catalog
  //  row no longer matches the seed by name and will appear as "added" rather
  //  than "modified". Documented as accepted behaviour, no schema changes.
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Paginated quote list for one organisation. Returns lightweight rows
   * (no inputs or line item bodies — those come from getQuoteDetail) so the
   * Quotes tab loads fast even on orgs with hundreds of quotes.
   */
  getOrgQuotes: adminProcedure
    .input(z.object({
      orgId: z.number(),
      page: z.number().min(1).optional().default(1),
      limit: z.number().min(1).max(100).optional().default(20),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { quotes: [], total: 0 };

      const { quotes, quoteLineItems, quoteInputs } = await import("../../drizzle/schema");
      const { eq, desc, count } = await import("drizzle-orm");

      const orgIdBig = BigInt(input.orgId) as any;

      // Total count first so the UI can render pagination immediately
      const totalRows = await db
        .select({ value: count() })
        .from(quotes)
        .where(eq(quotes.orgId, orgIdBig));
      const total = Number((totalRows[0] as any)?.value ?? 0);

      // Paginated quote rows, newest first
      const offset = (input.page - 1) * input.limit;
      const rows = await db
        .select()
        .from(quotes)
        .where(eq(quotes.orgId, orgIdBig))
        .orderBy(desc(quotes.createdAt))
        .limit(input.limit)
        .offset(offset);

      // Enrich each row with input + line item counts. Two extra queries per
      // quote — fine at this page size; if lists ever feel slow we can add a
      // single grouped count query, but at 20/page this is cheap.
      const enriched = await Promise.all(rows.map(async (q: any) => {
        const liCountRows = await db
          .select({ value: count() })
          .from(quoteLineItems)
          .where(eq(quoteLineItems.quoteId, q.id));
        const inCountRows = await db
          .select({ value: count() })
          .from(quoteInputs)
          .where(eq(quoteInputs.quoteId, q.id));
        return {
          id: Number(q.id),
          title: q.title,
          reference: q.reference,
          clientName: q.clientName,
          status: q.status,
          subtotal: q.subtotal,
          total: q.total,
          monthlyTotal: q.monthlyTotal,
          annualTotal: q.annualTotal,
          tradePreset: q.tradePreset,
          quoteMode: q.quoteMode,
          createdAt: q.createdAt,
          updatedAt: q.updatedAt,
          sentAt: q.sentAt,
          acceptedAt: q.acceptedAt,
          lineItemCount: Number((liCountRows[0] as any)?.value ?? 0),
          inputCount: Number((inCountRows[0] as any)?.value ?? 0),
        };
      }));

      return { quotes: enriched, total };
    }),

  /**
   * Full quote inspection for one quote. Returns:
   *   - quote: metadata + AI draft fields (userPrompt, processingInstructions,
   *            comprehensiveConfig — these are diagnostic-only, never edited
   *            here)
   *   - lineItems: each tagged with source = "stock" | "modified" | "added"
   *                | "adhoc" based on a name match into the org's catalog
   *                and the sector seed
   *   - inputs: every input the customer fed in (text/voice/photo/document/
   *             email), with file_key for the existing /api/file/{key}
   *             authed proxy so the admin can view/download them
   *   - hasSeedForSector / orgSector: surfaces whether source-matching is
   *             reliable on this quote (no seed → all items show as "adhoc"
   *             or "added"; the UI uses these flags to set expectations)
   */
  getQuoteDetail: adminProcedure
    .input(z.object({ quoteId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB not available");

      const { quotes, quoteLineItems, quoteInputs, catalogItems, users, orgMembers } = await import("../../drizzle/schema");
      const { eq, asc, and } = await import("drizzle-orm");
      const { getCatalogSeedForSector } = await import("../catalogSeeds");

      const quoteIdBig = BigInt(input.quoteId) as any;

      // Quote
      const quoteRows = await db
        .select()
        .from(quotes)
        .where(eq(quotes.id, quoteIdBig))
        .limit(1);
      if (quoteRows.length === 0) throw new Error("Quote not found");
      const quote = quoteRows[0] as any;

      // Line items, in display order
      const lineItems = await db
        .select()
        .from(quoteLineItems)
        .where(eq(quoteLineItems.quoteId, quote.id))
        .orderBy(asc(quoteLineItems.sortOrder));

      // Inputs, oldest first (matches creation order in the workspace)
      const inputs = await db
        .select()
        .from(quoteInputs)
        .where(eq(quoteInputs.quoteId, quote.id))
        .orderBy(asc(quoteInputs.createdAt));

      // Resolve org's owner sector for seed lookup. Members are ordered by
      // role asc — owner first — but we filter explicitly to be safe.
      let orgSector: string | null = null;
      if (quote.orgId !== null && quote.orgId !== undefined) {
        const ownerRows = await db
          .select({ sector: users.defaultTradeSector })
          .from(orgMembers)
          .innerJoin(users, eq(users.id, orgMembers.userId))
          .where(and(
            eq(orgMembers.orgId, quote.orgId),
            eq(orgMembers.role, "owner")
          ))
          .limit(1);
        orgSector = ((ownerRows[0] as any)?.sector ?? null) as string | null;
      }

      // Build the org's catalog map, keyed by lowercase item name
      const catalogByName = new Map<string, any>();
      if (quote.orgId !== null && quote.orgId !== undefined) {
        const catRows = await db
          .select()
          .from(catalogItems)
          .where(eq(catalogItems.orgId, quote.orgId));
        for (const item of catRows) {
          if ((item as any).name) {
            catalogByName.set(String((item as any).name).toLowerCase(), item);
          }
        }
      }

      // Build the seed map for the org's sector, keyed the same way
      const seed = orgSector ? getCatalogSeedForSector(orgSector) : null;
      const seedByName = new Map<string, any>();
      if (seed) {
        for (const s of seed) seedByName.set(s.name.toLowerCase(), s);
      }

      function determineSource(itemName: string | null | undefined): "stock" | "modified" | "added" | "adhoc" {
        if (!itemName) return "adhoc";
        const key = itemName.toLowerCase();
        const catItem: any = catalogByName.get(key);
        if (!catItem) return "adhoc";              // not in this org's catalog at all
        const seedItem: any = seedByName.get(key);
        if (!seedItem) return "added";             // in catalog but not in seed = user-added
        // Both exist — compare canonical fields to detect modification
        const sameRate    = String(catItem.defaultRate) === String(seedItem.defaultRate);
        const sameDesc    = (catItem.description || "") === (seedItem.description || "");
        const sameUnit    = (catItem.unit || "each")     === (seedItem.unit || "each");
        const samePricing = (catItem.pricingType || "standard") === (seedItem.pricingType || "standard");
        return (sameRate && sameDesc && sameUnit && samePricing) ? "stock" : "modified";
      }

      return {
        quote: {
          id: Number(quote.id),
          orgId: quote.orgId !== null && quote.orgId !== undefined ? Number(quote.orgId) : null,
          title: quote.title,
          reference: quote.reference,
          status: quote.status,
          clientName: quote.clientName,
          contactName: quote.contactName,
          clientEmail: quote.clientEmail,
          clientPhone: quote.clientPhone,
          clientAddress: quote.clientAddress,
          description: quote.description,
          terms: quote.terms,
          paymentTerms: quote.paymentTerms,
          userPrompt: quote.userPrompt,
          processingInstructions: quote.processingInstructions,
          tradePreset: quote.tradePreset,
          quoteMode: quote.quoteMode,
          subtotal: quote.subtotal,
          taxRate: quote.taxRate,
          taxAmount: quote.taxAmount,
          total: quote.total,
          monthlyTotal: quote.monthlyTotal,
          annualTotal: quote.annualTotal,
          comprehensiveConfig: quote.comprehensiveConfig,
          createdAt: quote.createdAt,
          updatedAt: quote.updatedAt,
          sentAt: quote.sentAt,
          acceptedAt: quote.acceptedAt,
        },
        lineItems: lineItems.map((li: any) => ({
          id: Number(li.id),
          description: li.description,
          itemName: li.itemName,
          quantity: li.quantity,
          unit: li.unit,
          rate: li.rate,
          total: li.total,
          category: li.category,
          pricingType: li.pricingType,
          isPassthrough: li.isPassthrough,
          isOptional: li.isOptional,
          isEstimated: li.isEstimated,
          sortOrder: li.sortOrder,
          source: determineSource(li.itemName),
        })),
        inputs: inputs.map((inp: any) => ({
          id: Number(inp.id),
          type: inp.inputType,
          filename: inp.filename,
          fileUrl: inp.fileUrl,
          fileKey: inp.fileKey,
          content: inp.content,
          mimeType: inp.mimeType,
          processedContent: inp.processedContent,
          processingStatus: inp.processingStatus,
          processingError: inp.processingError,
          createdAt: inp.createdAt,
        })),
        orgSector,
        hasSeedForSector: seed !== null,
      };
    }),

  /**
   * Catalog diff for one organisation. Each item is categorised:
   *   - stock:    matches a seed entry exactly (rate, desc, unit, pricingType)
   *   - modified: name matches a seed entry but at least one field differs
   *               (seedValue is populated with the original values for the diff UI)
   *   - added:    name doesn't match any seed entry — user-created item
   *   - disabled: is_active = 0 (overrides the above; user has soft-deleted it)
   *
   * If the org's owner has no defaultTradeSector or no seed exists for that
   * sector, every item falls into "added" or "disabled" since there's nothing
   * to diff against. The UI uses hasSeedForSector to set expectations.
   */
  getOrgCatalog: adminProcedure
    .input(z.object({ orgId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) {
        return {
          items: [],
          stats: { total: 0, stock: 0, modified: 0, added: 0, disabled: 0 },
          sector: null,
          hasSeedForSector: false,
        };
      }

      const { catalogItems, users, orgMembers } = await import("../../drizzle/schema");
      const { eq, asc, and } = await import("drizzle-orm");
      const { getCatalogSeedForSector } = await import("../catalogSeeds");

      const orgIdBig = BigInt(input.orgId) as any;

      // Resolve owner sector
      const ownerRows = await db
        .select({ sector: users.defaultTradeSector })
        .from(orgMembers)
        .innerJoin(users, eq(users.id, orgMembers.userId))
        .where(and(
          eq(orgMembers.orgId, orgIdBig),
          eq(orgMembers.role, "owner")
        ))
        .limit(1);
      const orgSector = ((ownerRows[0] as any)?.sector ?? null) as string | null;

      // Pull all catalog items for this org, sorted by category then name for
      // a stable display order
      const items = await db
        .select()
        .from(catalogItems)
        .where(eq(catalogItems.orgId, orgIdBig))
        .orderBy(asc(catalogItems.category), asc(catalogItems.name));

      // Build seed map
      const seed = orgSector ? getCatalogSeedForSector(orgSector) : null;
      const seedByName = new Map<string, any>();
      if (seed) {
        for (const s of seed) seedByName.set(s.name.toLowerCase(), s);
      }

      let stockCount = 0;
      let modifiedCount = 0;
      let addedCount = 0;
      let disabledCount = 0;

      const enriched = items.map((item: any) => {
        const isDisabled = item.isActive === 0;
        const seedItem = item.name ? seedByName.get(String(item.name).toLowerCase()) : null;

        let status: "stock" | "modified" | "added" | "disabled";
        let seedValue: { defaultRate: string; description: string; unit: string; pricingType: string } | null = null;

        if (isDisabled) {
          status = "disabled";
          disabledCount++;
        } else if (!seedItem) {
          status = "added";
          addedCount++;
        } else {
          const sameRate    = String(item.defaultRate) === String(seedItem.defaultRate);
          const sameDesc    = (item.description || "") === (seedItem.description || "");
          const sameUnit    = (item.unit || "each")     === (seedItem.unit || "each");
          const samePricing = (item.pricingType || "standard") === (seedItem.pricingType || "standard");
          if (sameRate && sameDesc && sameUnit && samePricing) {
            status = "stock";
            stockCount++;
          } else {
            status = "modified";
            modifiedCount++;
            seedValue = {
              defaultRate: String(seedItem.defaultRate),
              description: String(seedItem.description),
              unit: String(seedItem.unit),
              pricingType: String(seedItem.pricingType),
            };
          }
        }

        return {
          id: Number(item.id),
          name: item.name,
          description: item.description,
          category: item.category,
          unit: item.unit,
          defaultRate: item.defaultRate,
          costPrice: item.costPrice,
          pricingType: item.pricingType,
          isActive: item.isActive === 1,
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
          status,
          seedValue,
        };
      });

      return {
        items: enriched,
        stats: {
          total: enriched.length,
          stock: stockCount,
          modified: modifiedCount,
          added: addedCount,
          disabled: disabledCount,
        },
        sector: orgSector,
        hasSeedForSector: seed !== null,
      };
    }),
});

