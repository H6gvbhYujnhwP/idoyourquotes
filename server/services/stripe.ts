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
    maxCatalogItems: 100,
    monthlyPrice: 0,
    features: ['ai_takeoff', 'quote_generation', 'pdf_export', 'basic_catalog'],
  },
  solo: {
    name: 'Solo',
    priceId: process.env.STRIPE_PRICE_SOLO || '',
    maxUsers: 1,
    maxQuotesPerMonth: 10,
    maxCatalogItems: 100,
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
 *
 * UPGRADE behaviour:
 *   - Subscription moves to new price immediately, proration_behavior: 'none'
 *     so no credit/debit adjustments are generated for the current period.
 *   - An invoice item for the full new tier price (ex-VAT) is added and
 *     immediately invoiced + paid against the customer's saved payment method.
 *   - automatic_tax is enabled on the invoice so Stripe calculates and
 *     applies VAT (20% UK) based on the customer's billing address.
 *   - Billing anchor is unchanged — the user gets the rest of the current
 *     billing period on the new tier at no extra cost (effectively free days).
 *   - Next renewal is on the original billing date at the new tier price.
 *   - chargedAmountPence returned is always the ex-VAT amount. VAT is
 *     added by Stripe; the actual card charge will be ex-VAT + VAT.
 *
 * DOWNGRADE behaviour:
 *   - Takes effect at next billing period (proration_behavior: 'none').
 *   - Webhook fires on renewal with new price.
 */
export async function changeSubscriptionTier(params: {
  stripeSubscriptionId: string;
  newTier: 'solo' | 'pro' | 'team' | 'business';
  orgId: number;
}): Promise<{ chargedAmountPence: number; nextBillingDate: Date }> {
  const newConfig = TIER_CONFIG[params.newTier];
  if (!newConfig.priceId) throw new Error(`No price for tier: ${params.newTier}`);

  const subscription = await stripe.subscriptions.retrieve(params.stripeSubscriptionId);
  const currentPriceId = subscription.items.data[0]?.price.id;
  const currentConfig = getTierByPriceId(currentPriceId || '');
  const upgrading = currentConfig
    ? (TIER_CONFIG[currentConfig]?.monthlyPrice || 0) < newConfig.monthlyPrice
    : true;

  if (upgrading) {
    // Step 1: Move subscription to new price with no proration adjustments.
    // Billing anchor stays — remaining days on old plan are free on new plan.
    await stripe.subscriptions.update(params.stripeSubscriptionId, {
      items: [{
        id: subscription.items.data[0].id,
        price: newConfig.priceId,
      }],
      proration_behavior: 'none',
      metadata: { orgId: String(params.orgId), tier: params.newTier },
    });

    // Step 2: Create the invoice first (empty, manual finalisation).
    // automatic_tax mirrors checkout session behaviour — Stripe calculates UK VAT (20%).
    // auto_advance: false means Stripe will not auto-finalise — we control the lifecycle.
    // pending_invoice_items_behavior: 'exclude' is CRITICAL — without it Stripe sweeps
    // any existing pending items (e.g. from a previous failed attempt) onto this invoice,
    // causing a double charge. We only want the item we explicitly attach in Step 3.
    const invoice = await stripe.invoices.create({
      customer: subscription.customer as string,
      auto_advance: false,
      automatic_tax: { enabled: true },
      pending_invoice_items_behavior: 'exclude',
      metadata: { orgId: String(params.orgId), tier: params.newTier, upgradeInvoice: 'true' },
    });

    // Step 3: Add the invoice item AFTER creating the invoice, passing invoice: invoice.id.
    // This attaches the item directly to this invoice rather than leaving it as a
    // pending item (which would cause it to roll onto the next renewal invoice instead).
    // Root cause of the £198 renewal bug: item was created before the invoice existed,
    // so Stripe left it as a dangling pending item not attached to anything.
    await stripe.invoiceItems.create({
      customer: subscription.customer as string,
      invoice: invoice.id, // CRITICAL: attach directly — never leave as pending item
      amount: newConfig.monthlyPrice, // ex-VAT pence — VAT added by automatic_tax
      currency: 'gbp',
      description: `Upgrade to ${newConfig.name} plan`,
      metadata: { orgId: String(params.orgId), tier: params.newTier },
    });

    // Step 4: Resolve the payment method to charge.
    // Stripe Checkout does not always set invoice_settings.default_payment_method
    // on the customer object, so invoices.pay() with no payment_method parameter
    // throws "There is no default_payment_method set on this Customer or Invoice".
    // We resolve in priority order:
    //   1. subscription.default_payment_method (set by Checkout on the subscription)
    //   2. customer.invoice_settings.default_payment_method
    //   3. First payment method from paymentMethods.list (the saved card)
    let resolvedPaymentMethodId: string | undefined;
    const subDefaultPm = typeof subscription.default_payment_method === 'string'
      ? subscription.default_payment_method
      : (subscription.default_payment_method as any)?.id;

    if (subDefaultPm) {
      resolvedPaymentMethodId = subDefaultPm;
      console.log(`[Stripe] Using subscription default_payment_method: ${resolvedPaymentMethodId}`);
    } else {
      const customer = await stripe.customers.retrieve(subscription.customer as string) as Stripe.Customer;
      const custDefaultPm = typeof customer.invoice_settings?.default_payment_method === 'string'
        ? customer.invoice_settings.default_payment_method
        : (customer.invoice_settings?.default_payment_method as any)?.id;
      if (custDefaultPm) {
        resolvedPaymentMethodId = custDefaultPm;
        console.log(`[Stripe] Using customer invoice_settings.default_payment_method: ${resolvedPaymentMethodId}`);
      } else {
        // Fall back to the first saved payment method on the customer
        const pms = await stripe.paymentMethods.list({ customer: subscription.customer as string, type: 'card', limit: 1 });
        if (pms.data.length > 0) {
          resolvedPaymentMethodId = pms.data[0].id;
          console.log(`[Stripe] Using first listed payment method: ${resolvedPaymentMethodId}`);
        }
      }
    }

    if (!resolvedPaymentMethodId) {
      throw new Error('No payment method found on customer — cannot charge upgrade invoice.');
    }

    // Step 5: Finalise and immediately pay.
    // Stripe may auto-collect on finalisation if the customer has auto-pay enabled.
    // In that case .pay() throws invoice_already_paid — money went through fine.
    // Any other error (card declined etc.) is rethrown so the caller sees the failure.
    await stripe.invoices.finalizeInvoice(invoice.id);

    try {
      await stripe.invoices.pay(invoice.id, { payment_method: resolvedPaymentMethodId });
    } catch (payErr: any) {
      const stripeCode = payErr?.raw?.code || payErr?.code;
      if (stripeCode !== 'invoice_already_paid') {
        throw payErr; // Real payment failure — bubble up to client
      }
      console.log(`[Stripe] Invoice ${invoice.id} auto-paid on finalise — upgrade succeeded.`);
    }

    // Update DB immediately after confirmed payment.
    // The customer.subscription.updated webhook will also fire and is idempotent,
    // but updating here ensures the UI reflects the new tier without waiting for
    // the webhook round-trip (which can take a few seconds).
    const config = newConfig;
    await updateOrganization(params.orgId, {
      subscriptionTier: params.newTier,
      subscriptionStatus: 'active',
      maxUsers: config.maxUsers,
      maxQuotesPerMonth: config.maxQuotesPerMonth,
      maxCatalogItems: config.maxCatalogItems,
      monthlyQuoteCount: 0,
      quoteCountResetAt: new Date(),
    } as any);

    console.log(`[Stripe] DB updated immediately after upgrade: org=${params.orgId} → ${params.newTier}`);

    const nextBillingDate = new Date(subscription.current_period_end * 1000);
    // Return ex-VAT amount — VAT is added by Stripe. UI shows both.
    return { chargedAmountPence: newConfig.monthlyPrice, nextBillingDate };

  } else {
    // Downgrade: move to new price at next billing period, no charge today.
    //
    // We set downgradeEffectiveAt = current_period_end (Unix timestamp string) in metadata.
    // The customer.subscription.updated webhook fires immediately when Stripe receives this
    // update — NOT at the billing period end. Without the flag, the webhook would apply the
    // lower tier limits (maxUsers, maxQuotesPerMonth, maxCatalogItems) right now, even though
    // the user has already paid for the current period on their existing tier.
    //
    // The webhook handler checks this flag:
    //   - If now < downgradeEffectiveAt → skip limits columns, user keeps current limits
    //   - If now >= downgradeEffectiveAt → apply limits normally (period has ended, renewal fired)
    //     and clear the flag from Stripe metadata so subsequent webhooks are not affected.
    await stripe.subscriptions.update(params.stripeSubscriptionId, {
      items: [{
        id: subscription.items.data[0].id,
        price: newConfig.priceId,
      }],
      proration_behavior: 'none',
      metadata: {
        orgId: String(params.orgId),
        tier: params.newTier,
        downgradeEffectiveAt: String(subscription.current_period_end),
      },
    });

    const nextBillingDate = new Date(subscription.current_period_end * 1000);
    return { chargedAmountPence: 0, nextBillingDate };
  }
}

/**
 * Preview the proration invoice for an upgrade.
 * Returns today's charge (prorated) and the ongoing monthly amount.
 */
export async function getUpgradeProration(params: {
  stripeSubscriptionId: string;
  newTier: 'solo' | 'pro' | 'team' | 'business';
}): Promise<{
  proratedAmountPence: number;
  newMonthlyPence: number;
  nextBillingDate: Date;
  currentPeriodEnd: Date;
}> {
  const newConfig = TIER_CONFIG[params.newTier];
  if (!newConfig.priceId) throw new Error(`No price for tier: ${params.newTier}`);

  const subscription = await stripe.subscriptions.retrieve(params.stripeSubscriptionId);

  const preview = await stripe.invoices.retrieveUpcoming({
    customer: subscription.customer as string,
    subscription: params.stripeSubscriptionId,
    subscription_items: [{
      id: subscription.items.data[0].id,
      price: newConfig.priceId,
    }],
    subscription_proration_behavior: 'create_prorations',
  });

  // amount_due is what they pay today (proration credit + new period charge)
  // We want just the prorated top-up: total - next full period amount
  const nextFullPeriod = newConfig.monthlyPrice;
  const proratedAmountPence = Math.max(0, (preview.amount_due || 0) - nextFullPeriod);

  return {
    proratedAmountPence,
    newMonthlyPence: newConfig.monthlyPrice,
    nextBillingDate: new Date(preview.period_end * 1000),
    currentPeriodEnd: new Date(subscription.current_period_end * 1000),
  };
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

      // Detect upgrade: compare new tier rank against current org tier
      const org = await getOrganizationById(orgId);
      const currentTierKey = (org as any)?.subscriptionTier as SubscriptionTier | null;
      const currentRank = currentTierKey ? getTierRank(currentTierKey) : 0;
      const newRank = getTierRank(tier);
      const isUpgrading = newRank > currentRank;

      // Deferred downgrade guard.
      //
      // When a downgrade is scheduled, changeSubscriptionTier writes
      // downgradeEffectiveAt (= current_period_end as a Unix timestamp string)
      // into Stripe subscription metadata. Stripe fires this webhook immediately
      // on any subscription mutation — not only at the billing period boundary —
      // so we must not apply the lower limits until the period has actually ended.
      //
      //   isPendingDowngrade=true  → now < effective timestamp
      //     Skip limits columns; user keeps current limits until renewal.
      //
      //   shouldClearDowngradeFlag=true → flag set but now >= effective timestamp
      //     Period has ended; apply limits normally and clear the flag from Stripe
      //     so subsequent webhooks are not affected. Clearing fires another
      //     subscription.updated event, but on that event downgradeEffectiveAt=''
      //     so isPendingDowngrade=false, limits apply, and the clear does not
      //     re-fire — no infinite loop.
      const downgradeEffectiveAt = subscription.metadata?.downgradeEffectiveAt;
      const nowUnix = Math.floor(Date.now() / 1000);
      const isPendingDowngrade = !!downgradeEffectiveAt &&
        downgradeEffectiveAt !== '' &&
        nowUnix < Number(downgradeEffectiveAt);

      const shouldClearDowngradeFlag = !!downgradeEffectiveAt &&
        downgradeEffectiveAt !== '' &&
        !isPendingDowngrade;

      if (shouldClearDowngradeFlag) {
        console.log(`[Stripe Webhook] Deferred downgrade now effective for org=${orgId} — clearing downgradeEffectiveAt flag`);
        // Fire-and-forget — failure to clear is non-fatal; the flag expires naturally
        // (next renewal the timestamp is in the past so isPendingDowngrade stays false)
        stripe.subscriptions.update(subscription.id, {
          metadata: { ...subscription.metadata, downgradeEffectiveAt: '' },
        }).catch(err => console.warn(`[Stripe Webhook] Failed to clear downgradeEffectiveAt for sub ${subscription.id}:`, err));
      }

      if (isPendingDowngrade) {
        console.log(`[Stripe Webhook] Deferred downgrade pending for org=${orgId} — effective at ${new Date(Number(downgradeEffectiveAt) * 1000).toISOString()} — skipping limits update`);
      }

      const updatePayload: Record<string, any> = {
        subscriptionTier: tier,
        subscriptionStatus: mapStripeStatus(subscription.status),
        stripeSubscriptionId: subscription.id,
        stripePriceId: priceId,
        // Guard against null/undefined Unix timestamps — `undefined * 1000 = NaN`
        // which produces an invalid Date that throws RangeError in Drizzle's
        // PgTimestamp.mapToDriverValue when it calls .toISOString().
        subscriptionCurrentPeriodStart: subscription.current_period_start
          ? new Date(subscription.current_period_start * 1000)
          : undefined,
        subscriptionCurrentPeriodEnd: subscription.current_period_end
          ? new Date(subscription.current_period_end * 1000)
          : undefined,
        subscriptionCancelAtPeriodEnd: subscription.cancel_at_period_end,
        // Limits are only applied when this is NOT a deferred downgrade still within
        // the paid period. When isPendingDowngrade=true the user has already paid for
        // their current tier limits through to current_period_end, so we leave those
        // columns untouched. At renewal isPendingDowngrade=false and limits apply normally.
        ...(!isPendingDowngrade && {
          maxUsers: config.maxUsers,
          maxQuotesPerMonth: config.maxQuotesPerMonth,
          maxCatalogItems: config.maxCatalogItems,
        }),
      };

      // Reset quote count immediately on upgrade — user has paid more, deserves full allowance
      if (isUpgrading) {
        updatePayload.monthlyQuoteCount = 0;
        updatePayload.quoteCountResetAt = new Date();
        console.log(`[Stripe Webhook] Upgrade detected (${currentTierKey} → ${tier}) — resetting monthlyQuoteCount to 0 for org=${orgId}`);
      }

      await updateOrganization(orgId, updatePayload as any);
      break;
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription;
      const orgId = Number(subscription.metadata?.orgId);
      
      if (!orgId) {
        console.error('[Stripe Webhook] Missing orgId in deleted subscription');
        return;
      }

      console.log(`[Stripe Webhook] Subscription deleted: org=${orgId}, sub=${subscription.id}`);

      // CRITICAL GUARD: Only reset the org if the deleted subscription is the org's
      // CURRENT subscription. During an upgrade via createCheckout, the old subscription
      // is cancelled and a new one is created. The delete webhook for the old one fires
      // AFTER the org has already been updated to point at the new subscription.
      // Without this guard, the delete unconditionally wipes the org back to trial —
      // even though the org is already active on a new subscription.
      const org = await getOrganizationById(orgId);
      const currentSubId = (org as any)?.stripeSubscriptionId;
      if (currentSubId && currentSubId !== subscription.id) {
        console.log(`[Stripe Webhook] Ignoring delete for old sub ${subscription.id} — org already on ${currentSubId}`);
        return;
      }

      // Downgrade to trial-like state (read-only — can view but not create)
      await updateOrganization(orgId, {
        subscriptionTier: 'trial',
        subscriptionStatus: 'canceled',
        stripeSubscriptionId: null,
        stripePriceId: null,
        subscriptionCancelAtPeriodEnd: false,
        maxUsers: 1,
        maxQuotesPerMonth: 0, // No new quotes when canceled
        maxCatalogItems: 100,
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
      // Also clear limit email flags so they can fire again next billing period
      const existingOrg = await getOrganizationById(orgId);
      const dayWorkRates = ((existingOrg as any)?.defaultDayWorkRates || {}) as Record<string, any>;
      const emailFlags = { ...(dayWorkRates._emailFlags || {}) };
      delete emailFlags.limitApproachingSent;
      delete emailFlags.limitReachedSent;
      const updatedRates = { ...dayWorkRates, _emailFlags: emailFlags };

      await updateOrganization(orgId, {
        monthlyQuoteCount: 0,
        quoteCountResetAt: new Date(),
        subscriptionStatus: 'active',
        defaultDayWorkRates: updatedRates,
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
 * Check if the org can use AI features (generateDraft, parseDictationSummary, transcribeAudio, etc.)
 * These cost OpenAI tokens — block only when fully cancelled/expired, not during grace periods.
 *
 * Blocks when:
 *   - subscriptionStatus === 'canceled' (fully cancelled, period ended)
 *   - subscriptionStatus === 'unpaid' (exhausted payment retries)
 *   - Trial expired (tier=trial AND trialEndsAt has passed)
 *
 * Does NOT block when:
 *   - past_due (grace during payment retry)
 *   - cancelAtPeriodEnd while period is still active (they paid for it)
 *   - Active trialing within the 14-day window
 */
export function canUseAIFeatures(org: {
  subscriptionTier: string;
  subscriptionStatus: string;
  trialEndsAt: Date | null;
}): { allowed: boolean; reason?: string } {
  if (org.subscriptionStatus === 'canceled') {
    return { allowed: false, reason: 'Your subscription has been cancelled. Please resubscribe to use AI features.' };
  }
  if (org.subscriptionStatus === 'unpaid') {
    return { allowed: false, reason: 'Your account has an unpaid invoice. Please update your payment method to use AI features.' };
  }
  if (org.subscriptionTier === 'trial' && isTrialExpired(org as any)) {
    return { allowed: false, reason: 'Your 14-day trial has expired. Choose a plan to continue using AI features.' };
  }
  return { allowed: true };
}

/**
 * Check if the org can add more catalog items
 */
export function canAddCatalogItem(org: {
  maxCatalogItems: number | null;
}, currentItemCount: number): { allowed: boolean; reason?: string } {
  const max = org.maxCatalogItems ?? 100;
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
