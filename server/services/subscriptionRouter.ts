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
import { router, protectedProcedure, publicProcedure } from "./trpc"; // adjust import path
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
} from "./services/stripe";
import { getUserPrimaryOrg, getOrgMembersByOrgId } from "./db";

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
});
