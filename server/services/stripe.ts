/**
 * Stripe Subscription Service
 * Handles checkout, webhooks, upgrades, downgrades, and tier management
 */
import Stripe from 'stripe';
import { updateOrganization, getOrganizationById } from '../db';

// ============ CONFIG ============

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2024-12-18.acacia' as any,
});

export { stripe };

// Tier configuration — maps tier names to Stripe price IDs and limits
export const TIER_CONFIG = {
  trial: {
    name: 'Trial',
    priceId: null, // No Stripe price for trial
    maxUsers: 1,
    maxQuotesPerMonth: 10,
    maxCatalogItems: 50,
    monthlyPrice: 0,
    features: ['ai_takeoff', 'quote_generation', 'pdf_export', 'basic_catalog'],
  },
  solo: {
    name: 'Solo',
    priceId: process.env.STRIPE_PRICE_SOLO || '',
    maxUsers: 1,
    maxQuotesPerMonth: 10,
    maxCatalogItems: 50,
    monthlyPrice: 5900, // pence
    features: ['ai_takeoff', 'quote_generation', 'pdf_export', 'basic_catalog', 'email_support'],
  },
  pro: {
    name: 'Pro',
    priceId: process.env.STRIPE_PRICE_PRO || '',
    maxUsers: 2,
    maxQuotesPerMonth: 15,
    maxCatalogItems: -1, // unlimited
    monthlyPrice: 9900,
    features: ['ai_takeoff', 'quote_generation', 'pdf_export', 'shared_catalog', 'team_collaboration', 'scope_control', 'timeline_planning', 'priority_support'],
  },
  team: {
    name: 'Team',
    priceId: process.env.STRIPE_PRICE_TEAM || 'price_1T4ifqPMGUpLvQsyi3YnQo5k',
    maxUsers: 5,
    maxQuotesPerMonth: 50,
    maxCatalogItems: -1,
    monthlyPrice: 15900,
    features: ['ai_takeoff', 'quote_generation', 'pdf_export', 'shared_catalog', 'team_collaboration', 'scope_control', 'timeline_planning', 'priority_support', 'advanced_modelling'],
  },
  business: {
    name: 'Business',
    priceId: process.env.STRIPE_PRICE_BUSINESS || '',
    maxUsers: 10,
    maxQuotesPerMonth: -1,
    maxCatalogItems: -1,
    monthlyPrice: 24900,
    features: ['ai_takeoff', 'quote_generation', 'pdf_export', 'shared_catalog', 'team_collaboration', 'scope_control', 'timeline_planning', 'priority_support', 'advanced_modelling', 'branded_proposals', 'priority_ai_queue', 'advanced_reporting'],
  },
} as const;

export type SubscriptionTier = keyof typeof TIER_CONFIG;

// Ordered tiers from cheapest to most expensive (for upgrade/downgrade comparison)
const TIER_ORDER: SubscriptionTier[] = ['trial', 'solo', 'pro', 'team', 'business'];

export function getTierRank(tier: SubscriptionTier): number {
  return TIER_ORDER.indexOf(tier);
}

export function isUpgrade(fromTier: SubscriptionTier, toTier: SubscriptionTier): boolean {
  return getTierRank(toTier) > getTierRank(fromTier);
}

// Reverse lookup: Stripe price ID → tier name
export function getTierByPriceId(priceId: string): SubscriptionTier | null {
  for (const [tier, config] of Object.entries(TIER_CONFIG)) {
    if (config.priceId === priceId) return tier as SubscriptionTier;
  }
  return null;
}

// ============ CHECKOUT ============

/**
 * Create a Stripe Checkout session for a new subscription or upgrade
 */
export async function createCheckoutSession(params: {
  orgId: number;
  tier: 'solo' | 'pro' | 'team' | 'business';
  customerEmail: string;
  stripeCustomerId?: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<string> {
  const config = TIER_CONFIG[params.tier];
  if (!config.priceId) throw new Error(`No price configured for tier: ${params.tier}`);

  // Create or reuse Stripe customer
  let customerId = params.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: params.customerEmail,
      metadata: { orgId: String(params.orgId) },
    });
    customerId = customer.id;
    // Save the customer ID
    await updateOrganization(params.orgId, { stripeCustomerId: customerId } as any);
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [{ price: config.priceId, quantity: 1 }],
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    subscription_data: {
      metadata: { orgId: String(params.orgId), tier: params.tier },
    },
    automatic_tax: { enabled: true },
    customer_update: {
      address: 'auto',
      name: 'auto',
    },
    tax_id_collection: { enabled: true },
    metadata: { orgId: String(params.orgId), tier: params.tier },
  });

  return session.url!;
}

// ============ BILLING PORTAL ============

/**
 * Create a Stripe Billing Portal session for managing subscription
 */
export async function createPortalSession(params: {
  stripeCustomerId: string;
  returnUrl: string;
}): Promise<string> {
  const session = await stripe.billingPortal.sessions.create({
    customer: params.stripeCustomerId,
    return_url: params.returnUrl,
  });
  return session.url;
}

// ============ SUBSCRIPTION CHANGES ============

/**
 * Change subscription tier (upgrade or downgrade)
 * Upgrades are immediate, downgrades take effect at period end
 */
export async function changeSubscriptionTier(params: {
  stripeSubscriptionId: string;
  newTier: 'solo' | 'pro' | 'team' | 'business';
  orgId: number;
}): Promise<void> {
  const newConfig = TIER_CONFIG[params.newTier];
  if (!newConfig.priceId) throw new Error(`No price for tier: ${params.newTier}`);

  const subscription = await stripe.subscriptions.retrieve(params.stripeSubscriptionId);
  const currentPriceId = subscription.items.data[0]?.price.id;
  const currentConfig = getTierByPriceId(currentPriceId || '');
  
  const upgrading = currentConfig
    ? (TIER_CONFIG[currentConfig]?.monthlyPrice || 0) < newConfig.monthlyPrice
    : true;

  await stripe.subscriptions.update(params.stripeSubscriptionId, {
    items: [{
      id: subscription.items.data[0].id,
      price: newConfig.priceId,
    }],
    // Upgrades: charge immediately with proration
    // Downgrades: take effect at next billing period
    proration_behavior: upgrading ? 'create_prorations' : 'none',
    metadata: { orgId: String(params.orgId), tier: params.newTier },
  });

  // If downgrade, it takes effect at period end via webhook
  // If upgrade, webhook will fire with new price and we update immediately
}

/**
 * Cancel subscription (takes effect at period end)
 */
export async function cancelSubscription(stripeSubscriptionId: string): Promise<void> {
  await stripe.subscriptions.update(stripeSubscriptionId, {
    cancel_at_period_end: true,
  });
}

/**
 * Resume a cancelled subscription (undo cancel_at_period_end)
 */
export async function resumeSubscription(stripeSubscriptionId: string): Promise<void> {
  await stripe.subscriptions.update(stripeSubscriptionId, {
    cancel_at_period_end: false,
  });
}

// ============ WEBHOOK HANDLER ============

/**
 * Process Stripe webhook events
 */
export async function handleStripeWebhook(event: Stripe.Event): Promise<void> {
  console.log(`[Stripe Webhook] ${event.type}`);

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      const orgId = Number(session.metadata?.orgId);
      const tier = session.metadata?.tier as SubscriptionTier;
      if (!orgId || !tier) {
        console.error('[Stripe Webhook] Missing orgId or tier in checkout metadata');
        return;
      }
      
      console.log(`[Stripe Webhook] Checkout completed: org=${orgId}, tier=${tier}`);
      
      // Subscription ID comes from the session
      const subscriptionId = session.subscription as string;
      if (subscriptionId) {
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        await activateSubscription(orgId, tier, subscription);
      }
      break;
    }

    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const subscription = event.data.object as Stripe.Subscription;
      const orgId = Number(subscription.metadata?.orgId);
      const priceId = subscription.items.data[0]?.price.id;
      const tier = subscription.metadata?.tier as SubscriptionTier || getTierByPriceId(priceId || '');

      if (!orgId || !tier) {
        console.error('[Stripe Webhook] Missing orgId or tier in subscription metadata');
        return;
      }

      console.log(`[Stripe Webhook] Subscription ${event.type}: org=${orgId}, tier=${tier}, status=${subscription.status}`);

      const config = TIER_CONFIG[tier];
      await updateOrganization(orgId, {
        subscriptionTier: tier,
        subscriptionStatus: mapStripeStatus(subscription.status),
        stripeSubscriptionId: subscription.id,
        stripePriceId: priceId,
        subscriptionCurrentPeriodStart: new Date(subscription.current_period_start * 1000),
        subscriptionCurrentPeriodEnd: new Date(subscription.current_period_end * 1000),
        subscriptionCancelAtPeriodEnd: subscription.cancel_at_period_end,
        maxUsers: config.maxUsers,
        maxQuotesPerMonth: config.maxQuotesPerMonth,
        maxCatalogItems: config.maxCatalogItems,
      } as any);
      break;
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription;
      const orgId = Number(subscription.metadata?.orgId);
      
      if (!orgId) {
        console.error('[Stripe Webhook] Missing orgId in deleted subscription');
        return;
      }

      console.log(`[Stripe Webhook] Subscription deleted: org=${orgId}`);

      // Downgrade to trial-like state (read-only — can view but not create)
      await updateOrganization(orgId, {
        subscriptionTier: 'trial',
        subscriptionStatus: 'canceled',
        stripeSubscriptionId: null,
        stripePriceId: null,
        subscriptionCancelAtPeriodEnd: false,
        maxUsers: 1,
        maxQuotesPerMonth: 0, // No new quotes when canceled
        maxCatalogItems: 50,
      } as any);
      break;
    }

    case 'invoice.payment_succeeded': {
      const invoice = event.data.object as Stripe.Invoice;
      const subscriptionId = invoice.subscription as string;
      if (!subscriptionId) return;
      
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      const orgId = Number(subscription.metadata?.orgId);
      if (!orgId) return;

      console.log(`[Stripe Webhook] Payment succeeded: org=${orgId}`);

      // Reset monthly quote count on successful payment
      await updateOrganization(orgId, {
        monthlyQuoteCount: 0,
        quoteCountResetAt: new Date(),
        subscriptionStatus: 'active',
      } as any);
      break;
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice;
      const subscriptionId = invoice.subscription as string;
      if (!subscriptionId) return;
      
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      const orgId = Number(subscription.metadata?.orgId);
      if (!orgId) return;

      console.log(`[Stripe Webhook] Payment failed: org=${orgId}`);

      await updateOrganization(orgId, {
        subscriptionStatus: 'past_due',
      } as any);
      break;
    }
  }
}

// ============ HELPERS ============

function mapStripeStatus(status: string): 'trialing' | 'active' | 'past_due' | 'canceled' | 'unpaid' | 'incomplete' {
  const map: Record<string, any> = {
    trialing: 'trialing',
    active: 'active',
    past_due: 'past_due',
    canceled: 'canceled',
    unpaid: 'unpaid',
    incomplete: 'incomplete',
    incomplete_expired: 'canceled',
    paused: 'canceled',
  };
  return map[status] || 'incomplete';
}

async function activateSubscription(orgId: number, tier: SubscriptionTier, subscription: Stripe.Subscription): Promise<void> {
  const config = TIER_CONFIG[tier];
  await updateOrganization(orgId, {
    subscriptionTier: tier,
    subscriptionStatus: mapStripeStatus(subscription.status),
    stripeSubscriptionId: subscription.id,
    stripePriceId: subscription.items.data[0]?.price.id,
    subscriptionCurrentPeriodStart: new Date(subscription.current_period_start * 1000),
    subscriptionCurrentPeriodEnd: new Date(subscription.current_period_end * 1000),
    subscriptionCancelAtPeriodEnd: false,
    trialEndsAt: null, // Clear trial
    maxUsers: config.maxUsers,
    maxQuotesPerMonth: config.maxQuotesPerMonth,
    maxCatalogItems: config.maxCatalogItems,
    monthlyQuoteCount: 0,
    quoteCountResetAt: new Date(),
  } as any);
}

// ============ TRIAL MANAGEMENT ============

/**
 * Check if an org's trial has expired
 */
export function isTrialExpired(org: { subscriptionTier: string; trialEndsAt: Date | null }): boolean {
  if (org.subscriptionTier !== 'trial') return false;
  if (!org.trialEndsAt) return true;
  return new Date() > new Date(org.trialEndsAt);
}

/**
 * Get days remaining in trial
 */
export function trialDaysRemaining(trialEndsAt: Date | null): number {
  if (!trialEndsAt) return 0;
  const diff = new Date(trialEndsAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

// ============ LIMIT CHECKS ============

/**
 * Check if the org can create a new quote (within monthly limit)
 * Returns usage info for frontend limit alerts
 */
export function canCreateQuote(org: {
  subscriptionTier: string;
  subscriptionStatus: string;
  maxQuotesPerMonth: number | null;
  monthlyQuoteCount: number | null;
  quoteCountResetAt: Date | null;
  trialEndsAt: Date | null;
}): { allowed: boolean; reason?: string; shouldResetCount?: boolean; usage?: { current: number; max: number; percentUsed: number } } {
  // Check subscription is active or trialing
  if (org.subscriptionStatus === 'canceled') {
    return { allowed: false, reason: 'Your subscription has been cancelled. Please resubscribe to create quotes.' };
  }
  if (org.subscriptionStatus === 'past_due') {
    return { allowed: false, reason: 'Your payment is past due. Please update your payment method.' };
  }
  if (org.subscriptionStatus === 'unpaid') {
    return { allowed: false, reason: 'Your account has an unpaid invoice. Please update your payment method.' };
  }

  // Check trial expiry
  if (org.subscriptionTier === 'trial' && isTrialExpired(org as any)) {
    return { allowed: false, reason: 'Your 14-day trial has expired. Choose a plan to continue.' };
  }

  // Check if monthly count needs resetting (30 days since last reset)
  let shouldResetCount = false;
  let currentCount = org.monthlyQuoteCount ?? 0;
  if (org.quoteCountResetAt) {
    const daysSinceReset = (Date.now() - new Date(org.quoteCountResetAt).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceReset >= 30) {
      shouldResetCount = true;
      currentCount = 0;
    }
  }

  // Check monthly quota (-1 = unlimited)
  const max = org.maxQuotesPerMonth ?? 10;
  if (max !== -1) {
    const percentUsed = max > 0 ? Math.round((currentCount / max) * 100) : 0;
    if (currentCount >= max) {
      return {
        allowed: false,
        reason: `You've reached your monthly limit of ${max} quotes. Upgrade your plan for more.`,
        usage: { current: currentCount, max, percentUsed: 100 },
      };
    }
    return { allowed: true, shouldResetCount, usage: { current: currentCount, max, percentUsed } };
  }

  return { allowed: true, shouldResetCount };
}

/**
 * Check if the org can add more team members
 */
export function canAddTeamMember(org: {
  maxUsers: number | null;
}, currentMemberCount: number): { allowed: boolean; reason?: string; usage?: { current: number; max: number } } {
  const max = org.maxUsers ?? 1;
  if (currentMemberCount >= max) {
    return {
      allowed: false,
      reason: `Your plan allows up to ${max} user${max > 1 ? 's' : ''}. Upgrade to add more team members.`,
      usage: { current: currentMemberCount, max },
    };
  }
  return { allowed: true, usage: { current: currentMemberCount, max } };
}

/**
 * Check if the org can add more catalog items
 */
export function canAddCatalogItem(org: {
  maxCatalogItems: number | null;
}, currentItemCount: number): { allowed: boolean; reason?: string } {
  const max = org.maxCatalogItems ?? 50;
  if (max !== -1 && currentItemCount >= max) {
    return { allowed: false, reason: `Your plan allows up to ${max} catalogue items. Upgrade for unlimited.` };
  }
  return { allowed: true };
}

/**
 * Get a human-readable upgrade suggestion based on current tier
 */
export function getUpgradeSuggestion(currentTier: string, limitType: 'quotes' | 'users' | 'catalog'): { suggestedTier: SubscriptionTier; tierName: string; price: number; newLimit: string } | null {
  const rank = getTierRank(currentTier as SubscriptionTier);
  // Find the next tier up
  for (let i = rank + 1; i < TIER_ORDER.length; i++) {
    const nextTier = TIER_ORDER[i];
    const config = TIER_CONFIG[nextTier];
    let newLimit = '';
    if (limitType === 'quotes') {
      newLimit = config.maxQuotesPerMonth === -1 ? 'unlimited quotes' : `${config.maxQuotesPerMonth} quotes/month`;
    } else if (limitType === 'users') {
      newLimit = `${config.maxUsers} team members`;
    } else {
      newLimit = config.maxCatalogItems === -1 ? 'unlimited catalogue items' : `${config.maxCatalogItems} items`;
    }
    return {
      suggestedTier: nextTier,
      tierName: config.name,
      price: config.monthlyPrice / 100,
      newLimit,
    };
  }
  return null; // Already on highest tier
}
