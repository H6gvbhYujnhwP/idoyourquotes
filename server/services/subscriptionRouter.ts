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
  changeSubscriptionTier,
  TIER_CONFIG,
  isTrialExpired,
  trialDaysRemaining,
  canCreateQuote,
  canAddTeamMember,
  canAddCatalogItem,
  getUpgradeSuggestion,
  getUpgradeProration,
  isUpgrade as isTierUpgrade,
  getTierRank,
  listPaidInvoices,
  type SubscriptionTier,
} from "./stripe";
import { getUserPrimaryOrg, getOrgMembersByOrgId, getUserByEmail, getUserById, addOrgMember, getDb, updateOrganization, deleteAllOrgData } from "../db";
import { sendLimitWarningEmail, sendTierChangeEmail, sendCancellationEmail, sendAccountDeletedEmail, sendExitSurveyToSupport, sendTeamInviteEmail, sendOrgClosedEmail, sendPasswordResetEmail } from "./emailService";
import bcrypt from "bcryptjs";
import crypto from "crypto";

const PAID_TIERS = ['solo', 'pro', 'team'] as const;

// ---- Audit log helper ----
async function logTeamAction(
  orgId: number,
  actorUserId: number,
  targetUserId: number,
  action: string,
  detail: string,
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const { teamAuditLog } = await import("../../drizzle/schema");
  await db.insert(teamAuditLog).values({
    orgId: orgId as any,
    actorUserId: actorUserId as any,
    targetUserId: targetUserId as any,
    action,
    detail,
  });
}
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
        maxCatalogItems: 100,
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
    };
  }),

  // Create checkout session for subscribing
  // Preview proration for an upgrade — called before user confirms
  // Returns today's charge and ongoing monthly amount for the confirmation modal
  getProration: protectedProcedure
    .input(z.object({
      newTier: z.enum(['solo', 'pro', 'team']),
    }))
    .query(async ({ ctx, input }) => {
      const org = await getUserPrimaryOrg(ctx.user.id);
      if (!org) throw new Error("No organisation found");

      const stripeSubscriptionId = (org as any).stripeSubscriptionId;

      // No active subscription — just return the full price (new subscriber)
      if (!stripeSubscriptionId) {
        const config = TIER_CONFIG[input.newTier];
        return {
          proratedAmountPence: config.monthlyPrice,
          newMonthlyPence: config.monthlyPrice,
          nextBillingDate: null,
          currentPeriodEnd: null,
          isNewSubscription: true,
        };
      }

      try {
        const proration = await getUpgradeProration({
          stripeSubscriptionId,
          newTier: input.newTier,
        });
        return {
          ...proration,
          isNewSubscription: false,
        };
      } catch (err) {
        // If proration preview fails, fall back to full price — never block the upgrade
        console.warn('[getProration] Preview failed, returning full price:', err);
        const config = TIER_CONFIG[input.newTier];
        return {
          proratedAmountPence: config.monthlyPrice,
          newMonthlyPence: config.monthlyPrice,
          nextBillingDate: null,
          currentPeriodEnd: null,
          isNewSubscription: false,
        };
      }
    }),

  createCheckout: protectedProcedure
    .input(z.object({
      tier: z.enum(['solo', 'pro', 'team']),
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

  // Upgrade an existing active subscription in-place (no Stripe Checkout redirect).
  // Charges the full new tier price immediately against the saved payment method.
  // Billing anchor unchanged — remainder of current period on new tier is free.
  // The customer.subscription.updated webhook handles DB tier/limits update and quota reset.
  upgradeSubscription: protectedProcedure
    .input(z.object({
      newTier: z.enum(['solo', 'pro', 'team']),
    }))
    .mutation(async ({ ctx, input }) => {
      const org = await getUserPrimaryOrg(ctx.user.id);
      if (!org) throw new Error("No organisation found");

      // Only owners/admins can manage billing
      const members = await getOrgMembersByOrgId(org.id);
      const membership = members.find(m => Number(m.userId) === ctx.user.id);
      if (!membership || (membership.role !== 'owner' && membership.role !== 'admin')) {
        throw new Error("Only organisation owners and admins can manage billing");
      }

      const stripeSubscriptionId = (org as any).stripeSubscriptionId as string | null;
      if (!stripeSubscriptionId) {
        throw new Error("No active subscription found. Please subscribe first.");
      }

      const currentTier = (org as any).subscriptionTier as SubscriptionTier || 'trial';
      if (!isTierUpgrade(currentTier, input.newTier)) {
        throw new Error(`Cannot upgrade from ${currentTier} to ${input.newTier} — this is not an upgrade.`);
      }

      // Perform the upgrade: full charge now, billing anchor unchanged, proration_behavior: 'none'
      const { chargedAmountPence, nextBillingDate } = await changeSubscriptionTier({
        stripeSubscriptionId,
        newTier: input.newTier,
        orgId: org.id,
      });

      // Send tier change confirmation email (async, non-blocking)
      const oldConfig = TIER_CONFIG[currentTier];
      const newConfig = TIER_CONFIG[input.newTier];
      sendTierChangeEmail({
        to: (org as any).billingEmail || ctx.user.email,
        name: ctx.user.name || undefined,
        oldTierName: oldConfig?.name || currentTier,
        newTierName: newConfig.name,
        isUpgrade: true,
        newMaxQuotes: newConfig.maxQuotesPerMonth,
        newMaxUsers: newConfig.maxUsers,
        newPrice: newConfig.monthlyPrice / 100,
      }).catch(err => console.error('[Subscription] Failed to send tier change email:', err));

      console.log(`[Subscription] upgradeSubscription: org=${org.id} ${currentTier}→${input.newTier}, charged=${chargedAmountPence}p, nextBilling=${nextBillingDate.toISOString()}`);

      return {
        success: true,
        chargedAmountPence,
        nextBillingDate,
        newTierName: newConfig.name,
        newMaxQuotesPerMonth: newConfig.maxQuotesPerMonth,
      };
    }),

  // Downgrade an existing active subscription (takes effect at next billing period).
  // No charge today — user keeps current plan until renewal, then moves to lower tier.
  downgradeSubscription: protectedProcedure
    .input(z.object({
      newTier: z.enum(['solo', 'pro', 'team']),
    }))
    .mutation(async ({ ctx, input }) => {
      const org = await getUserPrimaryOrg(ctx.user.id);
      if (!org) throw new Error("No organisation found");

      // Only owners/admins can manage billing
      const members = await getOrgMembersByOrgId(org.id);
      const membership = members.find(m => Number(m.userId) === ctx.user.id);
      if (!membership || (membership.role !== 'owner' && membership.role !== 'admin')) {
        throw new Error("Only organisation owners and admins can manage billing");
      }

      const stripeSubscriptionId = (org as any).stripeSubscriptionId as string | null;
      if (!stripeSubscriptionId) {
        throw new Error("No active subscription found.");
      }

      const currentTier = (org as any).subscriptionTier as SubscriptionTier || 'trial';

      // Validate this is actually a downgrade
      if (getTierRank(input.newTier) >= getTierRank(currentTier)) {
        throw new Error(`Cannot downgrade from ${currentTier} to ${input.newTier} — use upgrade instead.`);
      }

      // Perform the downgrade: moves to new price at next billing period, no charge now.
      // changeSubscriptionTier handles the downgrade path (proration_behavior: none).
      const { nextBillingDate } = await changeSubscriptionTier({
        stripeSubscriptionId,
        newTier: input.newTier,
        orgId: org.id,
      });

      const oldConfig = TIER_CONFIG[currentTier];
      const newConfig = TIER_CONFIG[input.newTier];

      // Update DB immediately so the UI reflects the scheduled downgrade.
      // We update subscriptionTier only — NOT the limit columns (maxUsers, maxQuotesPerMonth,
      // maxCatalogItems). The user has already paid for the current period so they keep their
      // current limits until renewal. The customer.subscription.updated webhook at renewal
      // will update the limit columns when the period actually ends.
      await updateOrganization(org.id, {
        subscriptionTier: input.newTier,
      } as any);

      // Send tier change notification email (async, non-blocking)
      sendTierChangeEmail({
        to: (org as any).billingEmail || ctx.user.email,
        name: ctx.user.name || undefined,
        oldTierName: oldConfig?.name || currentTier,
        newTierName: newConfig.name,
        isUpgrade: false,
        newMaxQuotes: newConfig.maxQuotesPerMonth,
        newMaxUsers: newConfig.maxUsers,
        newPrice: newConfig.monthlyPrice / 100,
      }).catch(err => console.error('[Subscription] Failed to send tier change email:', err));

      console.log(`[Subscription] downgradeSubscription: org=${org.id} ${currentTier}→${input.newTier}, effective=${nextBillingDate.toISOString()}`);

      return {
        success: true,
        newTierName: newConfig.name,
        effectiveDate: nextBillingDate,
      };
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

    // Send cancellation confirmation email (async, non-blocking)
    const tierConfig = TIER_CONFIG[tier as SubscriptionTier];
    sendCancellationEmail({
      to: (org as any).billingEmail || ctx.user.email,
      name: ctx.user.name || undefined,
      tierName: tierConfig?.name || tier,
      cancelDate: (org as any).subscriptionCurrentPeriodEnd,
    }).catch(err => console.error('[Subscription] Failed to send cancellation email:', err));

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

  // List paid invoices for the current org (newest first, max 100).
  // Owner/admin only — same gate as every other billing procedure.
  listInvoices: protectedProcedure.query(async ({ ctx }) => {
    const org = await getUserPrimaryOrg(ctx.user.id);
    if (!org) return [];

    const members = await getOrgMembersByOrgId(org.id);
    const membership = members.find(m => Number(m.userId) === ctx.user.id);
    if (!membership || (membership.role !== 'owner' && membership.role !== 'admin')) {
      return [];
    }

    const stripeCustomerId = (org as any).stripeCustomerId as string | null;
    if (!stripeCustomerId) return [];

    return await listPaidInvoices({ stripeCustomerId });
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

          // Send email warning at 80% or 100% of limit.
          //
          // E.21 (May 2026) — dedupe guard added. Previously this fired the
          // email every time the front-end called canPerform with usage at
          // 80%+, which is on every quote-list refresh and dashboard load —
          // turning a friendly nudge into inbox spam. We now use the same
          // _emailFlags pattern that routers.ts (createQuote) uses. The flag
          // is cleared on `invoice.payment_succeeded` so emails fire fresh
          // each billing period.
          if (check.usage && check.usage.max > 0) {
            const pct = check.usage.percentUsed;
            if (pct >= 80) {
              const dayWorkRates = ((org as any).defaultDayWorkRates || {}) as Record<string, any>;
              const emailFlags = dayWorkRates._emailFlags || {};
              const isHardLimit = pct >= 100;
              const flagKey = isHardLimit ? 'limitReachedSent' : 'limitApproachingSent';

              if (!emailFlags[flagKey]) {
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
                  isHardLimit,
                }).then((sent) => {
                  if (!sent) return;
                  // Mark flag so we don't send again this billing period.
                  // The clear happens on invoice.payment_succeeded in stripe.ts.
                  const updatedFlags = { ...emailFlags, [flagKey]: new Date().toISOString() };
                  const updatedRates = { ...dayWorkRates, _emailFlags: updatedFlags };
                  updateOrganization(org.id, { defaultDayWorkRates: updatedRates } as any)
                    .catch(err => console.error('[Subscription] Failed to save limit email flag:', err));
                }).catch(err => console.error('[Subscription] Failed to send limit email:', err));
              }
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
            // E.21 (May 2026) — dedupe guard added. Previously this fired
            // the email every time the front-end queried canPerform on a
            // team-tier org already at its seat limit. New flag
            // `limitUsersReachedSent` lives in the same _emailFlags blob
            // and is cleared alongside the quote flags on
            // invoice.payment_succeeded.
            const dayWorkRates = ((org as any).defaultDayWorkRates || {}) as Record<string, any>;
            const emailFlags = dayWorkRates._emailFlags || {};
            const flagKey = 'limitUsersReachedSent';
            const suggestion = getUpgradeSuggestion(tier, 'users');

            if (!emailFlags[flagKey]) {
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
              }).then((sent) => {
                if (!sent) return;
                const updatedFlags = { ...emailFlags, [flagKey]: new Date().toISOString() };
                const updatedRates = { ...dayWorkRates, _emailFlags: updatedFlags };
                updateOrganization(org.id, { defaultDayWorkRates: updatedRates } as any)
                  .catch(err => console.error('[Subscription] Failed to save users limit flag:', err));
              }).catch(err => console.error('[Subscription] Failed to send limit email:', err));
            }

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
        isPending: !user?.emailVerified, // true = invited but hasn't set password yet
        lastSignedIn: user?.lastSignedIn || null,
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

      if (targetUser) {
        // Existing user — check not already a member, then add
        const existing = members.find(m => Number(m.userId) === targetUser.id);
        if (existing) {
          throw new Error("This user is already a member of your organisation");
        }

        await addOrgMember(org.id, targetUser.id, input.role);
        // Audit log
        await logTeamAction(org.id, ctx.user.id, targetUser.id, 'invite', `Invited existing user ${input.email} as ${input.role}`).catch(() => {});
        return { success: true, created: false };
      }

      // User doesn't exist — create account and invite them
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const { users } = await import("../../drizzle/schema");

      // Generate a random temporary password (they'll set their own via invite link)
      const tempPassword = crypto.randomBytes(24).toString("hex");
      const passwordHash = await bcrypt.hash(tempPassword, 12);

      // Generate invitation token (reuse email_verification_token column)
      const inviteToken = crypto.randomBytes(32).toString("hex");

      const [newUser] = await db.insert(users).values({
        email: input.email.toLowerCase(),
        passwordHash,
        name: null,
        role: "user" as const,
        isActive: true,
        emailVerified: false,
        emailVerificationToken: inviteToken,
        emailVerificationSentAt: new Date(),
      }).returning();

      if (!newUser) throw new Error("Failed to create user account");

      // Add to org — NO new org created (they join the inviter's org)
      await addOrgMember(org.id, newUser.id, input.role);

      // Send invite email with set-password link
      const inviterName = ctx.user.name || ctx.user.email;
      const orgName = (org as any).companyName || org.name || "your team";
      sendTeamInviteEmail({
        to: input.email.toLowerCase(),
        inviterName,
        orgName,
        token: inviteToken,
      }).catch(err => console.error("[Team] Failed to send invite email:", err));

      console.log(`[Team] Created invited user ${newUser.id} (${input.email}) for org ${org.id}`);
      await logTeamAction(org.id, ctx.user.id, newUser.id, 'invite', `Invited new user ${input.email} as ${input.role}`).catch(() => {});
      return { success: true, created: true };
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
      await logTeamAction(org.id, ctx.user.id, Number(target.userId), 'remove', `Removed member from organisation`).catch(() => {});
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
      await logTeamAction(org.id, ctx.user.id, Number(target.userId), 'role_change', `Role changed from ${target.role} → ${input.role}`).catch(() => {});
      return { success: true };
    }),

  // Reset a team member's password — sends them a fresh set-password invite link
  resetTeamMemberPassword: protectedProcedure
    .input(z.object({
      memberId: z.number(),
    }))
    .mutation(async ({ ctx, input }) => {
      const org = await getUserPrimaryOrg(ctx.user.id);
      if (!org) throw new Error("No organization found");

      // Only owner or admin can trigger a password reset
      const members = await getOrgMembersByOrgId(org.id);
      const myMembership = members.find(m => Number(m.userId) === ctx.user.id);
      if (!myMembership || myMembership.role === 'member') {
        throw new Error("Only owners and admins can reset team member passwords");
      }

      const target = members.find(m => m.id === input.memberId);
      if (!target) throw new Error("Member not found");
      if (target.role === 'owner') throw new Error("Cannot reset the owner's password");
      if (Number(target.userId) === ctx.user.id) throw new Error("Use the Profile tab to change your own password");

      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const { users } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");

      // Fetch the target user record
      const [targetUser] = await db.select().from(users).where(eq(users.id, BigInt(target.userId) as any)).limit(1);
      if (!targetUser) throw new Error("User not found");

      // Generate a fresh invite token — reuses the same emailVerificationToken column
      // and the same /set-password?token= endpoint used by the original invite flow.
      const newToken = crypto.randomBytes(32).toString("hex");
      await db.update(users)
        .set({ emailVerificationToken: newToken, emailVerificationSentAt: new Date() })
        .where(eq(users.id, BigInt(target.userId) as any));

      // E.21 (May 2026) — password resets get their own dedicated email
      // template now. The previous code reused sendTeamInviteEmail, which
      // greeted the existing team member with "You've been invited to
      // {orgName}" and "set your password and activate your account" —
      // both wrong for a password reset on an active user. The new
      // sendPasswordResetEmail template explains who reset it (admin /
      // owner name), provides the same set-password link (the token
      // mechanism is shared with the team-invite flow), and uses the
      // same 7-day expiry.
      const resetByName = ctx.user.name || ctx.user.email;
      const orgName = (org as any).companyName || org.name || "your team";
      await sendPasswordResetEmail({
        to: targetUser.email,
        resetByName,
        orgName,
        token: newToken,
      });

      console.log(`[Team] Password reset link sent to ${targetUser.email} by ${ctx.user.email}`);
      await logTeamAction(org.id, ctx.user.id, Number(target.userId), 'reset_password', `Password reset link sent to ${targetUser.email}`).catch(() => {});
      return { success: true };
    }),

  // Set a team member's password directly — admin sets it for them, no email required
  setTeamMemberPassword: protectedProcedure
    .input(z.object({
      memberId: z.number(),
      newPassword: z.string().min(8, 'Password must be at least 8 characters'),
    }))
    .mutation(async ({ ctx, input }) => {
      const org = await getUserPrimaryOrg(ctx.user.id);
      if (!org) throw new Error("No organization found");

      // Only owner or admin
      const members = await getOrgMembersByOrgId(org.id);
      const myMembership = members.find(m => Number(m.userId) === ctx.user.id);
      if (!myMembership || myMembership.role === 'member') {
        throw new Error("Only owners and admins can set team member passwords");
      }

      const target = members.find(m => m.id === input.memberId);
      if (!target) throw new Error("Member not found");
      if (target.role === 'owner') throw new Error("Cannot change the owner's password");
      if (Number(target.userId) === ctx.user.id) throw new Error("Use the Profile tab to change your own password");

      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const { users } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");

      const [targetUser] = await db.select().from(users).where(eq(users.id, BigInt(target.userId) as any)).limit(1);
      if (!targetUser) throw new Error("User not found");

      const passwordHash = await bcrypt.hash(input.newPassword, 12);

      // Set password, mark email verified (they now have access), clear any pending invite token
      await db.update(users).set({
        passwordHash,
        emailVerified: true,
        emailVerificationToken: null,
      }).where(eq(users.id, BigInt(target.userId) as any));

      console.log(`[Team] Password set directly for ${targetUser.email} by ${ctx.user.email}`);
      await logTeamAction(org.id, ctx.user.id, Number(target.userId), 'set_password', `Password set directly for ${targetUser.email}`).catch(() => {});
      return { success: true };
    }),

  // Fetch team audit log — owner/admin only
  teamAuditLog: protectedProcedure.query(async ({ ctx }) => {
    const org = await getUserPrimaryOrg(ctx.user.id);
    if (!org) return [];

    const members = await getOrgMembersByOrgId(org.id);
    const myMembership = members.find(m => Number(m.userId) === ctx.user.id);
    if (!myMembership || myMembership.role === 'member') return [];

    const db = await getDb();
    if (!db) return [];

    const { teamAuditLog, users } = await import("../../drizzle/schema");
    const { eq, desc } = await import("drizzle-orm");

    const logs = await db.select().from(teamAuditLog)
      .where(eq(teamAuditLog.orgId, org.id as any))
      .orderBy(desc(teamAuditLog.createdAt))
      .limit(100);

    // Enrich with actor names
    const result = [];
    for (const log of logs) {
      const [actor] = await db.select({ name: users.name, email: users.email })
        .from(users).where(eq(users.id, log.actorUserId as any)).limit(1);
      result.push({
        ...log,
        actorName: actor?.name || actor?.email || 'Unknown',
      });
    }
    return result;
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
      //
      // Pre-launch Hardening P1 (May 2026): capture every member's user ID
      // BEFORE we wipe the roster — we need to deactivate each of them and
      // email each non-owner that the team was closed. Previously only the
      // owner was deactivated, leaving other team members able to log in
      // but landing on a cryptic "No organisation found" error.
      const memberUserIds: number[] = members
        .map(m => Number(m.userId))
        .filter(id => Number.isFinite(id));
      const nonOwnerUserIds: number[] = memberUserIds.filter(id => id !== ctx.user.id);

      const db = await getDb();
      if (db) {
        const { orgMembers } = await import("../../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        await db.delete(orgMembers).where(eq(orgMembers.orgId, org.id));
        console.log(`[DeleteAccount] Org members deleted (${memberUserIds.length} captured for deactivation)`);
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

      // 6. Deactivate every member of the team — owner AND non-owners.
      //
      // Pre-launch Hardening P1 (May 2026): previously only ctx.user (the
      // owner) was deactivated, which orphaned Team-tier members. Now we
      // deactivate the whole roster captured in step 4.
      if (db && memberUserIds.length > 0) {
        const { users } = await import("../../drizzle/schema");
        const { inArray } = await import("drizzle-orm");
        await db.update(users)
          .set({ isActive: false } as any)
          .where(inArray(users.id, memberUserIds as any));
        console.log(`[DeleteAccount] Deactivated ${memberUserIds.length} user accounts (owner + ${nonOwnerUserIds.length} team members)`);
      }

      // 7. Send goodbye email to the owner (async)
      sendAccountDeletedEmail({
        to: ctx.user.email,
        name: ctx.user.name || undefined,
      }).catch(err => console.error(`[DeleteAccount] Goodbye email failed:`, err));

      // 7b. Send "team closed" email to each non-owner team member (async).
      //
      // Pre-launch Hardening P1 (May 2026): each remaining team member is
      // told the team was closed by the owner so they don't try to log in
      // and hit a cryptic error. We use the org's display name from before
      // the [DELETED] prefix was applied above.
      if (nonOwnerUserIds.length > 0) {
        const closedOrgDisplayName: string = (org as any).companyName || org.name || 'your team';
        const ownerDisplayName: string | undefined = ctx.user.name || undefined;
        for (const memberId of nonOwnerUserIds) {
          getUserById(memberId)
            .then(memberUser => {
              if (!memberUser?.email) return;
              return sendOrgClosedEmail({
                to: memberUser.email,
                name: memberUser.name || undefined,
                ownerName: ownerDisplayName,
                orgName: closedOrgDisplayName,
              });
            })
            .catch(err => console.error(`[DeleteAccount] Org-closed email failed for user ${memberId}:`, err));
        }
        console.log(`[DeleteAccount] Queued ${nonOwnerUserIds.length} org-closed emails`);
      }

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
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      console.log(`[DeleteAccount] Session invalidated for user ${ctx.user.id}`);

      console.log(`[DeleteAccount] ✅ Complete — org ${org.id}, ${quotesDeleted} quotes, ${fileKeys.length} files`);

      return { success: true, quotesDeleted, filesDeleted: fileKeys.length };
    }),
});
