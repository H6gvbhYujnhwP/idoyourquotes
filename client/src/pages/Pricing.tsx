import { useAuth } from "@/_core/hooks/useAuth";
import PublicHeader from "@/components/PublicHeader";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { Link, useLocation } from "wouter";
import { toast } from "sonner";
import {
  Check,
  X,
  ArrowRight,
  Zap,
  Users,
  Crown,
  Loader2,
  ArrowLeft,
  Shield,
  AlertCircle,
} from "lucide-react";
import { useState } from "react";

const brand = {
  navy: '#1a2b4a',
  teal: '#0d9488',
  tealLight: '#14b8a6',
};

interface TierCardProps {
  name: string;
  price: number;
  priceWithVat: number;
  tagline: string;
  icon: React.ReactNode;
  color: string;
  borderColor: string;
  bgGradient: string;
  whoItsFor: string[];
  limits: string[];
  buildFrom: string[];
  includes: string[];
  excludes?: string[];
  popular?: boolean;
  currentTier?: boolean;
  onSelect: () => void;
  loading?: boolean;
  buttonLabel: string;
}

function TierCard({
  name, price, priceWithVat, tagline, icon, color, borderColor, bgGradient,
  whoItsFor, limits, buildFrom, includes, excludes, popular, currentTier,
  onSelect, loading, buttonLabel,
}: TierCardProps) {
  return (
    <div
      className={`relative flex flex-col rounded-2xl border-2 overflow-hidden transition-all hover:shadow-xl ${
        popular ? 'scale-[1.02] shadow-lg' : 'shadow-md'
      }`}
      style={{ borderColor }}
    >
      {popular && (
        <div className="absolute top-0 right-0 px-4 py-1.5 text-xs font-extrabold text-white rounded-bl-xl" style={{ backgroundColor: brand.teal }}>
          MOST POPULAR
        </div>
      )}
      {currentTier && (
        <div className="absolute top-0 left-0 px-4 py-1.5 text-xs font-extrabold text-white rounded-br-xl bg-green-600">
          CURRENT PLAN
        </div>
      )}

      {/* Header */}
      <div className="px-6 pt-8 pb-5" style={{ background: bgGradient }}>
        <div className="flex items-center gap-3 mb-3">
          {icon}
          <h3 className="text-2xl font-extrabold text-white">{name}</h3>
        </div>
        <p className="text-white/70 text-sm mb-4">{tagline}</p>
        <div className="flex items-baseline gap-1">
          <span className="text-4xl font-extrabold text-white">£{price}</span>
          <span className="text-white/60 text-sm font-medium">/ month + VAT</span>
        </div>
        <p className="text-white/50 text-xs mt-1">£{priceWithVat.toFixed(2)} inc VAT</p>
      </div>

      {/* Body */}
      <div className="flex-1 px-6 py-5 bg-white space-y-5">
        {/* Who it's for */}
        <div>
          <h4 className="text-[11px] font-extrabold uppercase tracking-wider mb-2" style={{ color: brand.navy }}>Who it's for</h4>
          <ul className="space-y-1">
            {whoItsFor.map((item, i) => (
              <li key={i} className="text-sm text-gray-600 flex items-start gap-2">
                <span className="mt-1 w-1 h-1 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                {item}
              </li>
            ))}
          </ul>
        </div>

        {/* Limits */}
        <div>
          <h4 className="text-[11px] font-extrabold uppercase tracking-wider mb-2" style={{ color: brand.navy }}>Limits</h4>
          <ul className="space-y-1">
            {limits.map((item, i) => (
              <li key={i} className="text-sm text-gray-600 flex items-start gap-2">
                <span className="mt-1 w-1 h-1 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                {item}
              </li>
            ))}
          </ul>
        </div>

        {/* Build quotes from */}
        <div>
          <h4 className="text-[11px] font-extrabold uppercase tracking-wider mb-2" style={{ color: brand.navy }}>Build quotes from</h4>
          <ul className="space-y-1">
            {buildFrom.map((item, i) => (
              <li key={i} className="text-sm text-gray-600">{item}</li>
            ))}
          </ul>
        </div>

        {/* Includes */}
        <div>
          <h4 className="text-[11px] font-extrabold uppercase tracking-wider mb-2" style={{ color: brand.navy }}>Includes</h4>
          <ul className="space-y-1.5">
            {includes.map((item, i) => (
              <li key={i} className="text-sm text-gray-700 flex items-start gap-2">
                <Check className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color }} />
                {item}
              </li>
            ))}
          </ul>
        </div>

        {/* Excludes */}
        {excludes && excludes.length > 0 && (
          <div>
            <h4 className="text-[11px] font-extrabold uppercase tracking-wider mb-2 text-gray-400">Excludes</h4>
            <ul className="space-y-1.5">
              {excludes.map((item, i) => (
                <li key={i} className="text-sm text-gray-400 flex items-start gap-2">
                  <X className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* CTA */}
      <div className="px-6 py-5 bg-gray-50 border-t">
        <Button
          className="w-full text-sm font-bold py-5 rounded-xl transition-all"
          style={{
            backgroundColor: currentTier ? '#e5e7eb' : color,
            color: currentTier ? '#6b7280' : 'white',
          }}
          onClick={onSelect}
          disabled={loading || currentTier}
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : null}
          {currentTier ? 'Current Plan' : buttonLabel}
          {!currentTier && !loading && <ArrowRight className="ml-2 h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}

// Tier ranks for upgrade detection (client-side)
const TIER_RANK: Record<string, number> = { trial: 0, solo: 1, pro: 2, team: 3 };
const TIER_PRICES: Record<string, number> = { solo: 59, pro: 99, team: 159 };
const TIER_QUOTES: Record<string, number | string> = { solo: 10, pro: 15, team: 50 };

export default function Pricing() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [loadingTier, setLoadingTier] = useState<string | null>(null);
  const [confirmTier, setConfirmTier] = useState<'solo' | 'pro' | 'team' | null>(null);
  const [downgradeTier, setDowngradeTier] = useState<'solo' | 'pro' | 'team' | null>(null);
  const [newSubTier, setNewSubTier] = useState<'solo' | 'pro' | 'team' | null>(null);

  const subStatus = trpc.subscription.status.useQuery(undefined, {
    enabled: !!user,
  });

  const createCheckout = trpc.subscription.createCheckout.useMutation({
    onSuccess: (data) => {
      window.location.href = data.url;
    },
    onError: (err) => {
      toast.error(err.message);
      setLoadingTier(null);
    },
  });

  const createPortal = trpc.subscription.createPortal.useMutation({
    onSuccess: (data) => {
      window.location.href = data.url;
    },
    onError: (err) => {
      toast.error(err.message || 'Failed to open billing portal.');
      setLoadingTier(null);
    },
  });

  const upgradeSubscription = trpc.subscription.upgradeSubscription.useMutation({
    onSuccess: (data) => {
      const quotaLabel = (data.newMaxQuotesPerMonth as number) === -1 ? 'unlimited' : String(data.newMaxQuotesPerMonth);
      toast.success(
        `You're now on ${data.newTierName}! ${quotaLabel} quotes/month, active immediately.`,
        { duration: 6000 }
      );
      setLoadingTier(null);
      subStatus.refetch();
    },
    onError: (err) => {
      toast.error(err.message || "Upgrade failed. Please try again or contact support.");
      setLoadingTier(null);
    },
  });

  const downgradeSubscription = trpc.subscription.downgradeSubscription.useMutation({
    onSuccess: (data) => {
      const date = data.effectiveDate ? new Date(data.effectiveDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : 'your next renewal';
      toast.success(
        `Plan change scheduled — you'll move to ${data.newTierName} on ${date}.`,
        { duration: 8000 }
      );
      setLoadingTier(null);
      setDowngradeTier(null);
      subStatus.refetch();
    },
    onError: (err) => {
      toast.error(err.message || "Downgrade failed. Please try again or contact support.");
      setLoadingTier(null);
      setDowngradeTier(null);
    },
  });

  const currentTier = (subStatus.data?.tier || null) as string | null;
  const currentRank = currentTier ? (TIER_RANK[currentTier] ?? 0) : 0;
  // True when the user already has an active paid subscription (not just a Stripe customer)
  const hasActiveSubscription = !!(subStatus.data?.hasActiveSubscription && subStatus.data?.status === 'active');

  const handleSelectTier = (tier: 'solo' | 'pro' | 'team') => {
    if (!user) {
      setLocation("/register");
      return;
    }

    // Past-due subscribers must resolve their payment before changing tier.
    // Routing them through createCheckout would create a second Stripe subscription
    // on the same customer while the existing one is still open and past-due.
    // Redirect them to the billing portal where Stripe handles payment recovery.
    if (subStatus.data?.status === 'past_due') {
      toast.error(
        'Your last payment failed. Please update your payment method before changing plan.',
        { duration: 8000 }
      );
      createPortal.mutate();
      return;
    }

    const newRank = TIER_RANK[tier] ?? 0;
    const isUpgrade = newRank > currentRank;
    const isDowngrade = newRank < currentRank;

    // Existing active subscriber upgrading — show upgrade confirmation modal
    if (isUpgrade && hasActiveSubscription) {
      setConfirmTier(tier);
      return;
    }

    // Existing active subscriber downgrading — show downgrade confirmation modal
    if (isDowngrade && hasActiveSubscription) {
      setDowngradeTier(tier);
      return;
    }

    // New subscription (no active sub) — show confirmation modal before redirecting to Stripe
    setNewSubTier(tier);
  };

  const handleConfirmUpgrade = () => {
    if (!confirmTier) return;
    setLoadingTier(confirmTier);
    setConfirmTier(null);
    // Existing subscriber: charge full price now against saved card, no redirect
    upgradeSubscription.mutate({ newTier: confirmTier });
  };

  const handleConfirmDowngrade = () => {
    if (!downgradeTier) return;
    setLoadingTier(downgradeTier);
    downgradeSubscription.mutate({ newTier: downgradeTier });
  };

  const handleConfirmNewSub = () => {
    if (!newSubTier) return;
    setLoadingTier(newSubTier);
    createCheckout.mutate({ tier: newSubTier });
  };

  return (
    <div className="min-h-screen bg-white text-gray-900 font-sans antialiased">
      {/* Header — matches Home/Login/Register Manus styling */}
      <PublicHeader currentPage="pricing" />

      {/* Header */}
      <section className="pt-16 pb-8 text-center">
        <h1 className="text-4xl md:text-5xl font-extrabold mb-4" style={{ color: brand.navy }}>
          Simple, transparent pricing
        </h1>
        <p className="text-lg text-gray-500 max-w-xl mx-auto mb-2">
          Start with a free 14-day trial. No credit card required.
        </p>
        <p className="text-sm text-gray-400">
          All plans include VAT at 20%. Cancel anytime.
        </p>
      </section>

      {/* Tier Cards */}
      <section className="pb-20 px-4">
        <div className="max-w-7xl mx-auto grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          <TierCard
            name="Solo"
            price={59}
            priceWithVat={70.80}
            tagline="For individual tradespeople and sole business owners"
            icon={<Zap className="h-7 w-7 text-teal-300" />}
            color={brand.teal}
            borderColor="#e5e7eb"
            bgGradient={`linear-gradient(135deg, ${brand.navy} 0%, #1e3a5f 100%)`}
            whoItsFor={[
              "Sole traders",
              "Independent contractors",
              "Single-user businesses",
              "Domestic & small commercial projects",
            ]}
            limits={[
              "1 user",
              "Up to 10 quotes per month",
              "Unlimited manual quotes",
              "Standard AI processing",
            ]}
            buildFrom={[
              "📄 PDF drawings & tender documents",
              "📧 Email copy & pasted enquiries",
              "📝 Specifications & Word documents",
              "🖼 Images & photos",
              "🎤 Audio recordings & dictation",
            ]}
            includes={[
              "AI document interpretation",
              "AI symbol/device counting",
              "Interactive overlay verification",
              "Quote draft generation",
              "Basic product catalogue (up to 100 items)",
              "Standard PDF export",
              "Email-ready proposal generation",
              "Standard email support",
            ]}
            excludes={[
              "Team collaboration",
              "Advanced modelling logic",
              "API access",
            ]}
            currentTier={currentTier === 'solo'}
            onSelect={() => handleSelectTier('solo')}
            loading={loadingTier === 'solo'}
            buttonLabel={currentRank > 1 ? "Downgrade to Solo" : "Get Started"}
          />

          <TierCard
            name="Pro"
            price={99}
            priceWithVat={118.80}
            tagline="For growing businesses and small teams"
            icon={<Users className="h-7 w-7 text-blue-300" />}
            color="#3b82f6"
            borderColor="#3b82f6"
            bgGradient="linear-gradient(135deg, #1e3a5f 0%, #1e40af 100%)"
            whoItsFor={[
              "Small to medium contractors",
              "Trade businesses tendering regularly",
              "2-user teams",
              "Commercial project work",
            ]}
            limits={[
              "Up to 2 users",
              "Up to 15 AI quotes per month",
              "Unlimited manual quotes",
            ]}
            buildFrom={[
              "📄 PDF drawings (scaled plans supported)",
              "📧 Full tender email threads",
              "📝 Multi-document specifications",
              "🖼 Technical drawings & site images",
              "🎤 Voice notes & structured dictation",
              "📎 Combined multi-file uploads",
            ]}
            includes={[
              "Advanced AI takeoff & interpretation",
              "Trade-specific logic (where applicable)",
              "Interactive drawing overlays with verification",
              "Shared team catalogue",
              "Scope inclusion/exclusion control",
              "Timeline + site/quality planning tabs",
              "Multi-user collaboration",
              "Priority email support",
            ]}
            currentTier={currentTier === 'pro'}
            onSelect={() => handleSelectTier('pro')}
            loading={loadingTier === 'pro'}
            buttonLabel={currentRank > 2 ? "Downgrade to Pro" : "Upgrade to Pro"}
          />

          <TierCard
            name="Team"
            price={159}
            priceWithVat={190.80}
            tagline="For busy teams that quote frequently"
            icon={<Shield className="h-7 w-7 text-emerald-300" />}
            color="#059669"
            borderColor="#059669"
            bgGradient="linear-gradient(135deg, #1e3a5f 0%, #065f46 100%)"
            popular
            whoItsFor={[
              "Medium-sized contractors",
              "Multi-trade teams",
              "High-volume tendering",
              "Growing commercial operations",
            ]}
            limits={[
              "Up to 5 users",
              "Up to 50 AI quotes per month",
              "Unlimited manual quotes",
            ]}
            buildFrom={[
              "📄 PDF drawings (scaled plans supported)",
              "📧 Full tender email threads",
              "📝 Multi-document specifications",
              "🖼 Technical drawings & site images",
              "🎤 Voice notes & structured dictation",
              "📎 Combined multi-file uploads",
            ]}
            includes={[
              "Everything in Pro",
              "5 team members with role management",
              "Advanced modelling logic",
              "Higher monthly quota (50 quotes)",
              "Shared team catalogue (unlimited)",
              "Priority email support",
            ]}
            currentTier={currentTier === 'team'}
            onSelect={() => handleSelectTier('team')}
            loading={loadingTier === 'team'}
            buttonLabel={currentRank > 3 ? "Downgrade to Team" : "Upgrade to Team"}
          />

        </div>
      </section>

      {/* Free Trial Banner */}
      <section className="py-16 text-center" style={{ backgroundColor: brand.navy }}>
        <div className="container">
          <Crown className="h-10 w-10 text-teal-400 mx-auto mb-4" />
          <h2 className="text-3xl font-extrabold text-white mb-3">
            Try it free for 14 days
          </h2>
          <p className="text-white/60 max-w-lg mx-auto mb-6">
            Full Solo features, no credit card required. See the value before you commit.
          </p>
          {!user && (
            <Button
              size="lg"
              className="text-lg px-8 py-6 font-bold rounded-xl"
              style={{ backgroundColor: brand.teal }}
              onClick={() => setLocation("/register")}
            >
              Start Your Free Trial
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 border-t bg-white text-center">
        <p className="text-sm text-gray-400">
          © {new Date().getFullYear()} IdoYourQuotes. All rights reserved.
        </p>
      </footer>

      {/* Upgrade confirmation modal — existing subscribers only */}
      {/* Downgrade Confirmation Modal */}
      <Dialog open={!!downgradeTier} onOpenChange={(open) => { if (!open && !loadingTier) setDowngradeTier(null); }}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-1">
              <div className="flex items-center justify-center w-10 h-10 rounded-full" style={{ backgroundColor: '#fef3c7' }}>
                <ArrowLeft className="h-5 w-5" style={{ color: '#d97706' }} />
              </div>
              <DialogTitle className="text-lg" style={{ color: '#1a2b4a' }}>
                Downgrade to {downgradeTier ? downgradeTier.charAt(0).toUpperCase() + downgradeTier.slice(1) : ''}
              </DialogTitle>
            </div>
          </DialogHeader>

          <div className="space-y-3 py-1">

            {/* What happens */}
            <div className="rounded-lg border-2 p-4 space-y-3" style={{ borderColor: '#fde68a', backgroundColor: '#fffbeb' }}>
              <p className="text-sm font-semibold" style={{ color: '#1a2b4a' }}>Here's exactly what happens when you confirm:</p>
              <ul className="space-y-2">
                <li className="flex items-start gap-2 text-sm" style={{ color: '#1a2b4a' }}>
                  <Check className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: '#d97706' }} />
                  <span>
                    <strong>No charge today</strong> — your current plan continues until your billing date.
                  </span>
                </li>
                <li className="flex items-start gap-2 text-sm" style={{ color: '#1a2b4a' }}>
                  <Check className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: '#d97706' }} />
                  <span>
                    <strong>New plan starts on{' '}
                    {subStatus.data?.currentPeriodEnd
                      ? new Date(subStatus.data.currentPeriodEnd).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
                      : 'your next renewal'
                    }</strong> — you keep all current features until then.
                  </span>
                </li>
                <li className="flex items-start gap-2 text-sm" style={{ color: '#1a2b4a' }}>
                  <Check className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: '#d97706' }} />
                  <span>
                    <strong>New limits apply from renewal</strong> — your quote count and team size will adjust to{' '}
                    {downgradeTier ? downgradeTier.charAt(0).toUpperCase() + downgradeTier.slice(1) : ''} limits.
                  </span>
                </li>
              </ul>
            </div>

            {/* New limits summary */}
            {downgradeTier && (
              <div className="rounded-lg border p-3 space-y-1.5 text-sm">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  {downgradeTier.charAt(0).toUpperCase() + downgradeTier.slice(1)} plan limits from renewal
                </p>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Monthly price</span>
                  <span>£{TIER_PRICES[downgradeTier].toFixed(2)} + VAT / month</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Quotes per month</span>
                  <span>{TIER_QUOTES[downgradeTier] === -1 ? 'Unlimited' : TIER_QUOTES[downgradeTier]}</span>
                </div>
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              You can upgrade again at any time. Your existing quotes and data are never deleted.
            </p>

          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => setDowngradeTier(null)}
              disabled={!!loadingTier}
              className="w-full sm:w-auto"
            >
              Keep Current Plan
            </Button>
            <Button
              onClick={handleConfirmDowngrade}
              disabled={!!loadingTier}
              className="w-full sm:w-auto font-bold"
              style={{ backgroundColor: '#d97706' }}
            >
              {loadingTier ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Scheduling…
                </>
              ) : (
                <>
                  Confirm Downgrade
                  <ArrowRight className="h-4 w-4 ml-1" />
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Upgrade Confirmation Modal */}
      <Dialog open={!!confirmTier} onOpenChange={(open) => { if (!open && !loadingTier) setConfirmTier(null); }}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-1">
              <div className="flex items-center justify-center w-10 h-10 rounded-full" style={{ backgroundColor: '#f0fdfa' }}>
                <Crown className="h-5 w-5" style={{ color: '#0d9488' }} />
              </div>
              <DialogTitle className="text-lg" style={{ color: '#1a2b4a' }}>
                Upgrade to {confirmTier ? confirmTier.charAt(0).toUpperCase() + confirmTier.slice(1) : ''}
              </DialogTitle>
            </div>
          </DialogHeader>

          <div className="space-y-3 py-1">

            {/* What happens now */}
            <div className="rounded-lg border-2 p-4 space-y-3" style={{ borderColor: '#99f6e4', backgroundColor: '#f0fdfa' }}>
              <p className="text-sm font-semibold" style={{ color: '#1a2b4a' }}>Here's exactly what happens when you confirm:</p>
              <ul className="space-y-2">
                <li className="flex items-start gap-2 text-sm" style={{ color: '#1a2b4a' }}>
                  <Check className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: '#0d9488' }} />
                  <span>
                    <strong>Charged immediately</strong> to your saved payment method — full monthly price.
                  </span>
                </li>
                <li className="flex items-start gap-2 text-sm" style={{ color: '#1a2b4a' }}>
                  <Check className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: '#0d9488' }} />
                  <span>
                    <strong>New plan active instantly</strong> — your limits update the moment payment clears.
                  </span>
                </li>
                <li className="flex items-start gap-2 text-sm" style={{ color: '#1a2b4a' }}>
                  <Check className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: '#0d9488' }} />
                  <span>
                    <strong>Quote count resets to zero</strong> — you get your full{' '}
                    {confirmTier ? (TIER_QUOTES[confirmTier] === -1 ? ' unlimited ' : ` ${TIER_QUOTES[confirmTier]} `) : ' '}
                    quotes/month right now.
                  </span>
                </li>
                <li className="flex items-start gap-2 text-sm" style={{ color: '#1a2b4a' }}>
                  <Check className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: '#0d9488' }} />
                  <span>
                    <strong>Rest of this month is free</strong> — your next renewal stays on your original billing date, so you get the remaining days at no extra cost.
                  </span>
                </li>
              </ul>
            </div>

            {/* Billing breakdown — ex-VAT, VAT, total */}
            {confirmTier && (() => {
              const exVat = TIER_PRICES[confirmTier];
              const vat = Math.round(exVat * 0.20 * 100) / 100;
              const incVat = Math.round((exVat + vat) * 100) / 100;
              return (
                <div className="rounded-lg border p-3 space-y-1.5 text-sm">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Billing summary</p>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{confirmTier.charAt(0).toUpperCase() + confirmTier.slice(1)} plan (ex VAT)</span>
                    <span>£{exVat.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">VAT (20%)</span>
                    <span>£{vat.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between pt-1.5 border-t font-bold" style={{ color: '#1a2b4a' }}>
                    <span>Total charged today</span>
                    <span style={{ color: '#0d9488' }}>£{incVat.toFixed(2)}</span>
                  </div>
                </div>
              );
            })()}

            {/* Current usage context */}
            <div className="rounded-lg border p-3 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">
                You've used <strong>{subStatus.data?.currentQuoteCount ?? 0}</strong> of your{' '}
                <strong>{subStatus.data?.maxQuotesPerMonth}</strong> quotes this month.
                After upgrading you'll have{' '}
                <strong>{confirmTier ? (TIER_QUOTES[confirmTier] === -1 ? 'unlimited' : TIER_QUOTES[confirmTier]) : ''}</strong> quotes/month.
              </p>
            </div>

            <p className="text-xs text-muted-foreground">
              Your saved card will be charged £{confirmTier ? (TIER_PRICES[confirmTier] * 1.20).toFixed(2) : ''} (inc VAT). No redirect — this completes here.
              You'll receive a confirmation email once payment is processed.
            </p>

          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => setConfirmTier(null)}
              disabled={!!loadingTier}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmUpgrade}
              disabled={!!loadingTier}
              className="w-full sm:w-auto font-bold"
              style={{ backgroundColor: '#0d9488' }}
            >
              {loadingTier ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Processing…
                </>
              ) : (
                <>
                  Confirm Upgrade — £{confirmTier ? (TIER_PRICES[confirmTier] * 1.20).toFixed(2) : ''} inc VAT
                  <ArrowRight className="h-4 w-4 ml-1" />
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Subscription Confirmation Modal */}
      <Dialog open={!!newSubTier} onOpenChange={(open) => { if (!open && !loadingTier) setNewSubTier(null); }}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-1">
              <div className="flex items-center justify-center w-10 h-10 rounded-full" style={{ backgroundColor: '#f0fdfa' }}>
                <Crown className="h-5 w-5" style={{ color: '#0d9488' }} />
              </div>
              <DialogTitle className="text-lg" style={{ color: '#1a2b4a' }}>
                Subscribe to {newSubTier ? newSubTier.charAt(0).toUpperCase() + newSubTier.slice(1) : ''}
              </DialogTitle>
            </div>
          </DialogHeader>

          <div className="space-y-3 py-1">

            <p className="text-sm" style={{ color: '#1a2b4a' }}>
              You're about to start your {newSubTier ? newSubTier.charAt(0).toUpperCase() + newSubTier.slice(1) : ''} subscription. Here's what you'll pay today and every month.
            </p>

            {/* Billing breakdown — ex-VAT, VAT, total (duplicated from upgrade modal pattern) */}
            {newSubTier && (() => {
              const exVat = TIER_PRICES[newSubTier];
              const vat = Math.round(exVat * 0.20 * 100) / 100;
              const incVat = Math.round((exVat + vat) * 100) / 100;
              return (
                <div className="rounded-lg border p-3 space-y-1.5 text-sm">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Billing summary</p>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{newSubTier.charAt(0).toUpperCase() + newSubTier.slice(1)} plan (ex VAT)</span>
                    <span>£{exVat.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">VAT (20%)</span>
                    <span>£{vat.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between pt-1.5 border-t font-bold" style={{ color: '#1a2b4a' }}>
                    <span>Total charged today</span>
                    <span style={{ color: '#0d9488' }}>£{incVat.toFixed(2)}</span>
                  </div>
                </div>
              );
            })()}

            <p className="text-xs text-muted-foreground">
              You'll be redirected to Stripe to enter your card details. Cancel anytime from Settings → Billing.
            </p>

          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => setNewSubTier(null)}
              disabled={!!loadingTier}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmNewSub}
              disabled={!!loadingTier}
              className="w-full sm:w-auto font-bold"
              style={{ backgroundColor: '#0d9488' }}
            >
              {loadingTier ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Redirecting…
                </>
              ) : (
                <>
                  Continue to payment — £{newSubTier ? (TIER_PRICES[newSubTier] * 1.20).toFixed(2) : ''}
                  <ArrowRight className="h-4 w-4 ml-1" />
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
