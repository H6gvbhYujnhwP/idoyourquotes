/**
 * Subscription tRPC Router
 * 
 * Add to your main router in routers.ts:
 *   import { subscriptionRouter } from "./services/subscriptionRouter";
 *   
 *   Then add to the appRouter:
 *     subscription: subscriptionRouter,
 */
import { z } from "zod";
import { router, protectedProcedure, publicProcedure } from "../_core/trpc";
import {
  createCheckoutSession,
  createPortalSession,
  cancelSubscription,
  resumeSubscription,
  TIER_CONFIG,
  isTrialExpired,
  trialDaysRemaining,
  canCreateQuote,
  canAddTeamMember,
  canAddCatalogItem,
  getUpgradeSuggestion,
  type SubscriptionTier,
} from "./stripe";
import { getUserPrimaryOrg, getOrgMembersByOrgId, getUserByEmail, addOrgMember, getDb, updateOrganization, deleteAllOrgData } from "../db";
import { sendLimitWarningEmail, sendTierChangeEmail, sendAccountDeletedEmail, sendExitSurveyToSupport } from "./emailService";

const PAID_TIERS = ['solo', 'pro', 'team', 'business'] as const;
type PaidTier = typeof PAID_TIERS[number];

export const subscriptionRouter = router({
  // Get current subscription status for the org
  status: protectedProcedure.query(async ({ ctx }) => {
    const org = await getUserPrimaryOrg(ctx.user.id);
    if (!org) return null;

    const members = await getOrgMembersByOrgId(org.id);
    const tier = (org as any).subscriptionTier as SubscriptionTier || 'trial';
    const config = TIER_CONFIG[tier] || TIER_CONFIG.trial;

    // Calculate quote usage
    const quoteCheck = canCreateQuote(org as any);
    const memberCheck = canAddTeamMember(org as any, members.length);

    return {
      tier,
      tierName: config.name,
      status: (org as any).subscriptionStatus || 'trialing',
      isTrialExpired: isTrialExpired(org as any),
      trialDaysRemaining: trialDaysRemaining((org as any).trialEndsAt),
      trialEndsAt: (org as any).trialEndsAt,
      cancelAtPeriodEnd: (org as any).subscriptionCancelAtPeriodEnd || false,
      currentPeriodEnd: (org as any).subscriptionCurrentPeriodEnd,
      // Limits
      maxUsers: config.maxUsers,
      maxQuotesPerMonth: config.maxQuotesPerMonth,
      maxCatalogItems: config.maxCatalogItems,
      currentUsers: members.length,
      currentQuoteCount: (org as any).monthlyQuoteCount || 0,
      // Usage checks for frontend limit alerts
      quoteUsage: quoteCheck.usage || null,
      canCreateQuote: quoteCheck.allowed,
      quoteBlockReason: quoteCheck.reason || null,
      canAddTeamMember: memberCheck.allowed,
      teamBlockReason: memberCheck.reason || null,
      teamUsage: memberCheck.usage || null,
      // Stripe IDs (for frontend logic)
      hasStripeCustomer: !!(org as any).stripeCustomerId,
      hasActiveSubscription: !!(org as any).stripeSubscriptionId,
    };
  }),

  // Get tier info for pricing page (public)
  tiers: publicProcedure.query(() => {
    return {
      solo: {
        name: 'Solo',
        price: 59,
        priceWithVat: 70.80,
        maxUsers: 1,
        maxQuotesPerMonth: 10,
        maxCatalogItems: 50,
        features: TIER_CONFIG.solo.features,
      },
      pro: {
        name: 'Pro',
        price: 99,
        priceWithVat: 118.80,
        maxUsers: 2,
        maxQuotesPerMonth: 15,
        maxCatalogItems: -1,
        features: TIER_CONFIG.pro.features,
      },
      team: {
        name: 'Team',
        price: 159,
        priceWithVat: 190.80,
        maxUsers: 5,
        maxQuotesPerMonth: 50,
        maxCatalogItems: -1,
        features: TIER_CONFIG.team.features,
      },
      business: {
        name: 'Business',
        price: 249,
        priceWithVat: 298.80,
        maxUsers: 10,
        maxQuotesPerMonth: -1,
        maxCatalogItems: -1,
        features: TIER_CONFIG.business.features,
      },
    };
  }),

  // Create checkout session for subscribing
  createCheckout: protectedProcedure
    .input(z.object({
      tier: z.enum(['solo', 'pro', 'team', 'business']),
    }))
    .mutation(async ({ ctx, input }) => {
      const org = await getUserPrimaryOrg(ctx.user.id);
      if (!org) throw new Error("No organization found");

      // Check if user is org owner or admin
      // (only owners/admins can manage billing)
      const members = await getOrgMembersByOrgId(org.id);
      const membership = members.find(m => Number(m.userId) === ctx.user.id);
      if (!membership || (membership.role !== 'owner' && membership.role !== 'admin')) {
        throw new Error("Only organisation owners and admins can manage billing");
      }

      const baseUrl = process.env.APP_URL || 'https://idoyourquotes.com';
      const url = await createCheckoutSession({
        orgId: org.id,
        tier: input.tier,
        customerEmail: (org as any).billingEmail || ctx.user.email,
        stripeCustomerId: (org as any).stripeCustomerId || undefined,
        successUrl: `${baseUrl}/settings?tab=billing&status=success`,
        cancelUrl: `${baseUrl}/settings?tab=billing&status=canceled`,
      });

      return { url };
    }),

  // Create billing portal session for managing subscription
  createPortal: protectedProcedure.mutation(async ({ ctx }) => {
    const org = await getUserPrimaryOrg(ctx.user.id);
    if (!org) throw new Error("No organization found");
    if (!(org as any).stripeCustomerId) throw new Error("No billing account found. Subscribe first.");

    const baseUrl = process.env.APP_URL || 'https://idoyourquotes.com';
    const url = await createPortalSession({
      stripeCustomerId: (org as any).stripeCustomerId,
      returnUrl: `${baseUrl}/settings?tab=billing`,
    });

    return { url };
  }),

  // Cancel subscription at end of current billing period
  cancel: protectedProcedure.mutation(async ({ ctx }) => {
    const org = await getUserPrimaryOrg(ctx.user.id);
    if (!org) throw new Error("No organization found");

    // Only owners/admins can cancel
    const members = await getOrgMembersByOrgId(org.id);
    const membership = members.find(m => Number(m.userId) === ctx.user.id);
    if (!membership || (membership.role !== 'owner' && membership.role !== 'admin')) {
      throw new Error("Only organisation owners and admins can manage billing");
    }

    const stripeSubId = (org as any).stripeSubscriptionId;
    if (!stripeSubId) {
      throw new Error("No active subscription found. Nothing to cancel.");
    }

    const tier = (org as any).subscriptionTier as string;
    if (tier === 'trial') {
      throw new Error("You're on the free trial — there's nothing to cancel. Your trial will simply expire.");
    }

    if ((org as any).subscriptionCancelAtPeriodEnd) {
      throw new Error("Your subscription is already scheduled for cancellation.");
    }

    await cancelSubscription(stripeSubId);
    await updateOrganization(org.id, { subscriptionCancelAtPeriodEnd: true } as any);

    console.log(`[Subscription] User ${ctx.user.id} cancelled subscription for org ${org.id}`);

    return { 
      success: true,
      cancelDate: (org as any).subscriptionCurrentPeriodEnd,
    };
  }),

  // Resume a cancelled subscription (undo cancel_at_period_end)
  resume: protectedProcedure.mutation(async ({ ctx }) => {
    const org = await getUserPrimaryOrg(ctx.user.id);
    if (!org) throw new Error("No organization found");

    // Only owners/admins can resume
    const members = await getOrgMembersByOrgId(org.id);
    const membership = members.find(m => Number(m.userId) === ctx.user.id);
    if (!membership || (membership.role !== 'owner' && membership.role !== 'admin')) {
      throw new Error("Only organisation owners and admins can manage billing");
    }

    const stripeSubId = (org as any).stripeSubscriptionId;
    if (!stripeSubId) {
      throw new Error("No subscription found to resume.");
    }

    if (!(org as any).subscriptionCancelAtPeriodEnd) {
      throw new Error("Your subscription is already active — nothing to resume.");
    }

    await resumeSubscription(stripeSubId);
    await updateOrganization(org.id, { subscriptionCancelAtPeriodEnd: false } as any);

    console.log(`[Subscription] User ${ctx.user.id} resumed subscription for org ${org.id}`);

    return { success: true };
  }),

  // Check if user can perform a specific action — also triggers email warnings
  canPerform: protectedProcedure
    .input(z.object({
      action: z.enum(['create_quote', 'add_team_member', 'add_catalog_item']),
    }))
    .query(async ({ ctx, input }) => {
      const org = await getUserPrimaryOrg(ctx.user.id);
      if (!org) return { allowed: false, reason: 'No organization found' };

      const tier = (org as any).subscriptionTier as SubscriptionTier || 'trial';

      switch (input.action) {
        case 'create_quote': {
          const check = canCreateQuote(org as any);

          // Send email warning at 80% or 100% of limit
          if (check.usage && check.usage.max > 0) {
            const pct = check.usage.percentUsed;
            // Only email once per threshold — use a simple flag in metadata
            // For now, fire at 80% and 100% 
            if (pct >= 80) {
              const suggestion = getUpgradeSuggestion(tier, 'quotes');
              sendLimitWarningEmail({
                to: (org as any).billingEmail || ctx.user.email,
                name: ctx.user.name || undefined,
                limitType: 'quotes',
                currentUsage: check.usage.current,
                maxAllowed: check.usage.max,
                currentTierName: TIER_CONFIG[tier]?.name || tier,
                suggestedTierName: suggestion?.tierName,
                suggestedTierPrice: suggestion?.price,
                newLimit: suggestion?.newLimit,
                isHardLimit: pct >= 100,
              }).catch(err => console.error('[Subscription] Failed to send limit email:', err));
            }
          }

          return {
            ...check,
            upgradeSuggestion: !check.allowed ? getUpgradeSuggestion(tier, 'quotes') : null,
          };
        }
        case 'add_team_member': {
          const members = await getOrgMembersByOrgId(org.id);
          const check = canAddTeamMember(org as any, members.length);

          if (!check.allowed) {
            const suggestion = getUpgradeSuggestion(tier, 'users');
            sendLimitWarningEmail({
              to: (org as any).billingEmail || ctx.user.email,
              name: ctx.user.name || undefined,
              limitType: 'users',
              currentUsage: members.length,
              maxAllowed: (org as any).maxUsers || 1,
              currentTierName: TIER_CONFIG[tier]?.name || tier,
              suggestedTierName: suggestion?.tierName,
              suggestedTierPrice: suggestion?.price,
              newLimit: suggestion?.newLimit,
              isHardLimit: true,
            }).catch(err => console.error('[Subscription] Failed to send limit email:', err));

            return { ...check, upgradeSuggestion: suggestion };
          }
          return { ...check, upgradeSuggestion: null };
        }
        case 'add_catalog_item':
          // Would need catalog count — for now just check tier
          return { allowed: true, upgradeSuggestion: null };
        default:
          return { allowed: true, upgradeSuggestion: null };
      }
    }),

  // Get upgrade suggestion for the current tier and limit type
  getUpgrade: protectedProcedure
    .input(z.object({
      limitType: z.enum(['quotes', 'users', 'catalog']),
    }))
    .query(async ({ ctx, input }) => {
      const org = await getUserPrimaryOrg(ctx.user.id);
      if (!org) return null;
      const tier = (org as any).subscriptionTier as SubscriptionTier || 'trial';
      return getUpgradeSuggestion(tier, input.limitType);
    }),

  // ============ TEAM MANAGEMENT ============

  // Get team members with user details
  teamMembers: protectedProcedure.query(async ({ ctx }) => {
    const org = await getUserPrimaryOrg(ctx.user.id);
    if (!org) return [];

    const members = await getOrgMembersByOrgId(org.id);
    const db = await getDb();
    if (!db) return [];

    // Fetch user details for each member
    const { users } = await import("../../drizzle/schema");
    const { eq } = await import("drizzle-orm");
    
    const result = [];
    for (const member of members) {
      const [user] = await db.select().from(users).where(eq(users.id, BigInt(member.userId) as any)).limit(1);
      result.push({
        id: member.id,
        memberId: member.id,
        userId: member.userId,
        role: member.role,
        email: user?.email || 'Unknown',
        name: user?.name || null,
        joinedAt: member.acceptedAt || member.createdAt,
      });
    }
    return result;
  }),

  // Invite/add team member by email
  inviteTeamMember: protectedProcedure
    .input(z.object({
      email: z.string().email(),
      role: z.enum(['admin', 'member']).default('member'),
    }))
    .mutation(async ({ ctx, input }) => {
      const org = await getUserPrimaryOrg(ctx.user.id);
      if (!org) throw new Error("No organization found");

      // Check permissions — only owner/admin
      const members = await getOrgMembersByOrgId(org.id);
      const myMembership = members.find(m => Number(m.userId) === ctx.user.id);
      if (!myMembership || myMembership.role === 'member') {
        throw new Error("Only owners and admins can invite team members");
      }

      // Check seat limit
      const check = canAddTeamMember(org as any, members.length);
      if (!check.allowed) throw new Error(check.reason);

      // Find user by email
      const targetUser = await getUserByEmail(input.email);
      if (!targetUser) {
        throw new Error("No account found with that email. They need to create an IdoYourQuotes account first.");
      }

      // Check not already a member
      const existing = members.find(m => Number(m.userId) === targetUser.id);
      if (existing) {
        throw new Error("This user is already a member of your organisation");
      }

      await addOrgMember(org.id, targetUser.id, input.role);
      return { success: true };
    }),

  // Remove team member
  removeTeamMember: protectedProcedure
    .input(z.object({
      memberId: z.number(),
    }))
    .mutation(async ({ ctx, input }) => {
      const org = await getUserPrimaryOrg(ctx.user.id);
      if (!org) throw new Error("No organization found");

      // Check permissions
      const members = await getOrgMembersByOrgId(org.id);
      const myMembership = members.find(m => Number(m.userId) === ctx.user.id);
      if (!myMembership || myMembership.role === 'member') {
        throw new Error("Only owners and admins can remove team members");
      }

      // Find the member to remove
      const target = members.find(m => m.id === input.memberId);
      if (!target) throw new Error("Member not found");
      if (target.role === 'owner') throw new Error("Cannot remove the organisation owner");
      if (Number(target.userId) === ctx.user.id) throw new Error("Cannot remove yourself");

      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      const { orgMembers } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      await db.delete(orgMembers).where(eq(orgMembers.id, BigInt(input.memberId) as any));
      
      return { success: true };
    }),

  // Change team member role
  changeTeamMemberRole: protectedProcedure
    .input(z.object({
      memberId: z.number(),
      role: z.enum(['admin', 'member']),
    }))
    .mutation(async ({ ctx, input }) => {
      const org = await getUserPrimaryOrg(ctx.user.id);
      if (!org) throw new Error("No organization found");

      // Only owner can change roles
      const members = await getOrgMembersByOrgId(org.id);
      const myMembership = members.find(m => Number(m.userId) === ctx.user.id);
      if (!myMembership || myMembership.role !== 'owner') {
        throw new Error("Only the organisation owner can change roles");
      }

      const target = members.find(m => m.id === input.memberId);
      if (!target) throw new Error("Member not found");
      if (target.role === 'owner') throw new Error("Cannot change the owner's role");

      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      const { orgMembers } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      await db.update(orgMembers).set({ role: input.role }).where(eq(orgMembers.id, BigInt(input.memberId) as any));
      
      return { success: true };
    }),

  // Delete account — permanently removes all org data, cancels subscription, sends goodbye email
  deleteAccount: protectedProcedure
    .input(z.object({
      confirmText: z.string(),
      exitReason: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Require exact confirmation text
      if (input.confirmText !== 'DELETE') {
        throw new Error('Please type DELETE to confirm account deletion.');
      }

      const org = await getUserPrimaryOrg(ctx.user.id);
      if (!org) throw new Error("No organization found");

      // Only org owners can delete the account
      const members = await getOrgMembersByOrgId(org.id);
      const membership = members.find(m => Number(m.userId) === ctx.user.id);
      if (!membership || membership.role !== 'owner') {
        throw new Error("Only the organisation owner can delete the account.");
      }

      const tier = (org as any).subscriptionTier as string || 'trial';
      const stripeSubId = (org as any).stripeSubscriptionId;

      console.log(`[DeleteAccount] Starting deletion for org ${org.id} (${org.name}), user ${ctx.user.id}, tier: ${tier}`);

      // 1. Cancel Stripe subscription immediately (hard cancel, not end-of-period)
      if (stripeSubId) {
        try {
          const Stripe = (await import('stripe')).default;
          const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', { apiVersion: '2025-02-24.acacia' as any });
          await stripe.subscriptions.cancel(stripeSubId);
          console.log(`[DeleteAccount] Stripe subscription ${stripeSubId} cancelled immediately`);
        } catch (err) {
          console.error(`[DeleteAccount] Stripe cancel failed (continuing):`, err);
          // Continue with deletion even if Stripe cancel fails — we don't want to trap users
        }
      }

      // 2. Delete all org data (quotes, inputs, line items, takeoffs, catalog, usage logs)
      //    Returns file keys for R2 cleanup
      let fileKeys: string[] = [];
      let quotesDeleted = 0;
      try {
        const result = await deleteAllOrgData(org.id);
        fileKeys = result.fileKeys;
        quotesDeleted = result.quotesDeleted;
        console.log(`[DeleteAccount] Deleted ${quotesDeleted} quotes, ${fileKeys.length} file keys collected`);
      } catch (err) {
        console.error(`[DeleteAccount] Data deletion failed:`, err);
        throw new Error('Failed to delete account data. Please try again or contact support.');
      }

      // 3. Delete R2 files (async, don't block on failures)
      if (fileKeys.length > 0) {
        const { deleteFromR2 } = await import('../r2Storage');
        for (const key of fileKeys) {
          deleteFromR2(key).catch(err => {
            console.error(`[DeleteAccount] R2 delete failed for ${key}:`, err);
          });
        }
        console.log(`[DeleteAccount] Queued ${fileKeys.length} R2 file deletions`);
      }

      // 4. Delete org members
      const db = await getDb();
      if (db) {
        const { orgMembers } = await import("../../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        await db.delete(orgMembers).where(eq(orgMembers.orgId, org.id));
        console.log(`[DeleteAccount] Org members deleted`);
      }

      // 5. Soft-delete the org (mark inactive but preserve for anti-gaming domain check)
      //    The user record in the users table is NOT deleted — isDomainTrialUsed checks users table
      await updateOrganization(org.id, {
        name: `[DELETED] ${org.name}`,
        subscriptionTier: 'trial' as any,
        subscriptionStatus: 'canceled' as any,
        stripeSubscriptionId: null,
        subscriptionCancelAtPeriodEnd: true,
        monthlyQuoteCount: 0,
      } as any);
      console.log(`[DeleteAccount] Org ${org.id} soft-deleted`);

      // 6. Deactivate the user account
      if (db) {
        const { users } = await import("../../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        await db.update(users).set({ isActive: false } as any).where(eq(users.id, ctx.user.id));
        console.log(`[DeleteAccount] User ${ctx.user.id} deactivated`);
      }

      // 7. Send goodbye email to user (async)
      sendAccountDeletedEmail({
        to: ctx.user.email,
        name: ctx.user.name || undefined,
      }).catch(err => console.error(`[DeleteAccount] Goodbye email failed:`, err));

      // 8. Send exit survey to support (async)
      if (input.exitReason) {
        sendExitSurveyToSupport({
          userEmail: ctx.user.email,
          userName: ctx.user.name || undefined,
          companyName: (org as any).companyName || org.name,
          reason: input.exitReason,
          tier,
        }).catch(err => console.error(`[DeleteAccount] Exit survey email failed:`, err));
      }

      // 9. Invalidate session — clear the cookie
      const { COOKIE_NAME } = await import("@shared/const");
      const { getSessionCookieOptions } = await import("../_core/cookies");
      const cookieOptions = getSessionCookieOptions();
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      console.log(`[DeleteAccount] Session invalidated for user ${ctx.user.id}`);

      console.log(`[DeleteAccount] ✅ Complete — org ${org.id}, ${quotesDeleted} quotes, ${fileKeys.length} files`);

      return { success: true, quotesDeleted, filesDeleted: fileKeys.length };
    }),
});
