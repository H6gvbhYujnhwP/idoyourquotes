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
  TIER_CONFIG,
  isTrialExpired,
  trialDaysRemaining,
  canCreateQuote,
  canAddTeamMember,
  canAddCatalogItem,
  type SubscriptionTier,
} from "./stripe";
import { getUserPrimaryOrg, getOrgMembersByOrgId, getUserByEmail, addOrgMember, getDb } from "../db";

export const subscriptionRouter = router({
  // Get current subscription status for the org
  status: protectedProcedure.query(async ({ ctx }) => {
    const org = await getUserPrimaryOrg(ctx.user.id);
    if (!org) return null;

    const members = await getOrgMembersByOrgId(org.id);
    const tier = (org as any).subscriptionTier as SubscriptionTier || 'trial';
    const config = TIER_CONFIG[tier] || TIER_CONFIG.trial;

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
        maxUsers: 3,
        maxQuotesPerMonth: -1,
        maxCatalogItems: -1,
        features: TIER_CONFIG.pro.features,
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
      tier: z.enum(['solo', 'pro', 'business']),
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

  // Check if user can perform a specific action
  canPerform: protectedProcedure
    .input(z.object({
      action: z.enum(['create_quote', 'add_team_member', 'add_catalog_item']),
    }))
    .query(async ({ ctx, input }) => {
      const org = await getUserPrimaryOrg(ctx.user.id);
      if (!org) return { allowed: false, reason: 'No organization found' };

      switch (input.action) {
        case 'create_quote':
          return canCreateQuote(org as any);
        case 'add_team_member': {
          const members = await getOrgMembersByOrgId(org.id);
          return canAddTeamMember(org as any, members.length);
        }
        case 'add_catalog_item':
          // Would need catalog count — for now just check tier
          return { allowed: true };
        default:
          return { allowed: true };
      }
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
});
