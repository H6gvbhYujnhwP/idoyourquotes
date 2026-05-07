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
  // popular cards render dark navy with white text; others render white
  const isDark = !!popular;
  const cardBg = isDark ? brand.navy : '#ffffff';
  const headingColor = isDark ? '#ffffff' : brand.navy;
  const taglineColor = isDark ? 'rgb(191 219 254)' : '#6b7280';
  const bodyColor = isDark ? 'rgb(219 234 254)' : '#4b5563';
  const labelColor = isDark ? 'rgb(147 197 253)' : '#9ca3af';
  const dividerColor = isDark ? 'rgba(255,255,255,0.10)' : '#f3f4f6';

  return (
    <div
      className={`relative flex flex-col rounded-2xl overflow-hidden transition-all hover:shadow-2xl pub-card-lift ${
        popular ? 'shadow-2xl' : 'shadow-sm'
      }`}
      style={{ background: cardBg, border: isDark ? 'none' : `1px solid ${borderColor}` }}
    >
      {popular && (
        <div
          className="absolute top-4 right-4 text-xs font-bold text-white px-3 py-1 rounded-full"
          style={{ backgroundColor: brand.teal }}
        >
          Most Popular
        </div>
      )}
      {currentTier && (
        <div className="absolute top-4 left-4 text-xs font-bold text-white px-3 py-1 rounded-full bg-green-600">
          Current Plan
        </div>
      )}

      <div className="p-8 flex flex-col flex-1">
        {/* Plan header: icon + name + tagline */}
        <div className="mb-6 mt-2">
          <div className="flex items-center gap-3 mb-3">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center"
              style={{ background: 'rgba(13,148,136,0.12)' }}
            >
              {icon}
            </div>
            <h3 className="text-xl font-black" style={{ color: headingColor }}>{name}</h3>
          </div>
          <p className="text-sm" style={{ color: taglineColor }}>{tagline}</p>
        </div>

        {/* Price */}
        <div className="mb-6">
          <div className="flex items-end gap-1">
            <span className="text-5xl font-black" style={{ color: headingColor }}>£{price}</span>
            <span className="text-sm mb-2" style={{ color: taglineColor }}>/month + VAT</span>
          </div>
          <p className="text-xs mt-1" style={{ color: taglineColor }}>£{priceWithVat.toFixed(2)} inc VAT</p>
        </div>

        {/* Body sections */}
        <div className="space-y-4 mb-8 flex-1">
          {/* Who it's for */}
          <div>
            <div className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: labelColor }}>
              Who it's for
            </div>
            <ul className="space-y-1.5">
              {whoItsFor.map((item, i) => (
                <li key={i} className="text-sm flex items-center gap-2" style={{ color: bodyColor }}>
                  <span style={{ color: brand.teal }}>✓</span> {item}
                </li>
              ))}
            </ul>
          </div>

          {/* Limits */}
          <div className="border-t pt-3" style={{ borderColor: dividerColor }}>
            <div className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: labelColor }}>
              Limits
            </div>
            <ul className="space-y-1.5">
              {limits.map((item, i) => (
                <li key={i} className="text-sm flex items-center gap-2" style={{ color: bodyColor }}>
                  <span style={{ color: brand.teal }}>✓</span> {item}
                </li>
              ))}
            </ul>
          </div>

          {/* Build quotes from */}
          <div className="border-t pt-3" style={{ borderColor: dividerColor }}>
            <div className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: labelColor }}>
              Build quotes from
            </div>
            <ul className="space-y-1">
              {buildFrom.map((item, i) => (
                <li key={i} className="text-sm" style={{ color: bodyColor }}>{item}</li>
              ))}
            </ul>
          </div>

          {/* Includes */}
          <div className="border-t pt-3" style={{ borderColor: dividerColor }}>
            <div className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: labelColor }}>
              Includes
            </div>
            <ul className="space-y-1.5">
              {includes.map((item, i) => (
                <li key={i} className="text-sm flex items-start gap-2" style={{ color: bodyColor }}>
                  <Check className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: brand.teal }} />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          {/* Excludes */}
          {excludes && excludes.length > 0 && (
            <div className="border-t pt-3" style={{ borderColor: dividerColor }}>
              <div className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: isDark ? 'rgba(255,255,255,0.40)' : '#9ca3af' }}>
                Excludes
              </div>
              <ul className="space-y-1.5">
                {excludes.map((item, i) => (
                  <li key={i} className="text-sm flex items-start gap-2" style={{ color: isDark ? 'rgba(255,255,255,0.50)' : '#9ca3af' }}>
                    <X className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* CTA */}
        <Button
          className={`w-full text-sm font-bold py-6 rounded-xl transition-all ${popular ? 'pub-btn-pulse' : ''}`}
          style={{
            backgroundColor: currentTier ? '#e5e7eb' : (popular ? brand.teal : 'transparent'),
            color: currentTier ? '#6b7280' : (popular ? 'white' : brand.navy),
            border: !popular && !currentTier ? `2px solid ${brand.navy}` : 'none',
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

// Bgs and gradients on TierCardProps are unused now (popular flag + brand tokens handle it),
// but kept on the interface to avoid breaking the call sites below. The bgGradient/borderColor
// values passed in are simply ignored by the new render.

// ComparisonCell — used by the feature comparison table
function ComparisonCell({ value, highlighted }: { value: boolean | string; highlighted?: boolean }) {
  const bg = highlighted ? 'rgba(13,148,136,0.05)' : undefined;
  if (value === true) {
    return (
      <td className="p-4 text-center" style={{ background: bg }}>
        <Check className="h-5 w-5 inline-block" style={{ color: brand.teal }} />
      </td>
    );
  }
  if (value === false) {
    return <td className="p-4 text-center text-gray-300" style={{ background: bg }}>—</td>;
  }
  return <td className="p-4 text-center text-gray-600" style={{ background: bg }}>{value}</td>;
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

  // Pre-launch Hardening (May 2026): when the user lands here from /register
  // with ?trial=skipped, their business domain had been used for a previous
  // trial, so the new org started with no free trial. Show a one-line banner
  // explaining why they're on the pricing page rather than the dashboard.
  const trialWasSkipped = typeof window !== "undefined"
    && new URLSearchParams(window.location.search).get("trial") === "skipped";

  return (
    <div className="min-h-screen bg-white text-gray-900 font-sans antialiased">
      {/* Header — matches Home/Login/Register Manus styling */}
      <PublicHeader currentPage="pricing" />

      {trialWasSkipped && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-3">
          <div className="max-w-7xl mx-auto flex items-start gap-3">
            <div className="text-amber-600 font-bold text-lg leading-none mt-0.5">!</div>
            <div className="text-sm text-amber-900">
              <strong>Welcome — your account is ready.</strong> Your business domain has previously trialled IdoYourQuotes, so this account starts without a free trial. Choose a plan below to begin quoting.
            </div>
          </div>
        </div>
      )}

      {/* Hero band */}
      <section className="pub-hero-band text-white py-16 md:py-20 relative overflow-hidden">
        <div
          className="absolute inset-0 opacity-5 pointer-events-none"
          style={{
            backgroundImage:
              "repeating-linear-gradient(0deg,transparent,transparent 39px,rgba(255,255,255,0.3) 39px,rgba(255,255,255,0.3) 40px), repeating-linear-gradient(90deg,transparent,transparent 39px,rgba(255,255,255,0.3) 39px,rgba(255,255,255,0.3) 40px)",
          }}
        />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10">
          <div className="pub-accent-bar mx-auto" />
          <h1 className="text-4xl sm:text-5xl font-black mb-4 pub-anim-fade-up">
            Simple, transparent pricing
          </h1>
          <p className="text-blue-100 text-lg max-w-xl mx-auto mb-3 pub-anim-fade-up pub-delay-200">
            Start with a free 14-day trial. No credit card required. Only pay after 14 days if you're happy — we know you'll love it.
          </p>
          <p className="text-blue-300 text-sm pub-anim-fade-up pub-delay-300">
            All prices exclude VAT at 20%. Cancel anytime.
          </p>
        </div>
      </section>

      {/* Tier Cards */}
      <section className="py-16 md:py-20 px-4" style={{ background: '#f1f5f9' }}>
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

      {/* Feature Comparison Table */}
      <section className="py-16 md:py-20 bg-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <div className="pub-accent-bar mx-auto" />
            <h2 className="text-3xl font-black" style={{ color: brand.navy }}>Feature comparison</h2>
            <p className="mt-3 text-gray-500">See exactly what's included in each plan</p>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-gray-100 shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-white" style={{ background: brand.navy }}>
                  <th className="text-left p-4 font-semibold w-1/2">Feature</th>
                  <th className="text-center p-4 font-semibold">Solo</th>
                  <th className="text-center p-4 font-semibold" style={{ background: 'rgba(13,148,136,0.20)' }}>Pro</th>
                  <th className="text-center p-4 font-semibold">Team</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["Users", "1", "Up to 2", "Up to 5"],
                  ["AI quotes per month", "10", "15", "50"],
                  ["Unlimited manual quotes", true, true, true],
                  ["PDF tenders & specifications", true, true, true],
                  ["Voice notes & dictation", true, true, true],
                  ["Email threads (.eml / .msg)", true, true, true],
                  ["Branded proposal templates", true, true, true],
                  ["Product catalogue", "Up to 100 items", "Shared, unlimited", "Shared, unlimited"],
                  ["Smart defaults", true, true, true],
                  ["Quick PDF output", true, true, true],
                  ["Contract / Tender output", true, true, true],
                  ["Advanced AI takeoff & interpretation", false, true, true],
                  ["IT migration appendix", false, true, true],
                  ["Multi-user collaboration", false, true, true],
                  ["Role management", false, false, true],
                  ["Advanced modelling logic", false, false, true],
                  ["Support", "Standard email", "Priority email", "Priority email"],
                ].map(([label, solo, pro, team], i) => (
                  <tr key={i} className="border-t border-gray-100 hover:bg-slate-50/50 transition-colors">
                    <td className="p-4 font-medium text-gray-700">{label as string}</td>
                    <ComparisonCell value={solo as boolean | string} />
                    <ComparisonCell value={pro as boolean | string} highlighted />
                    <ComparisonCell value={team as boolean | string} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-16 md:py-20" style={{ background: '#f1f5f9' }}>
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <div className="pub-accent-bar mx-auto" />
            <h2 className="text-3xl font-black" style={{ color: brand.navy }}>Frequently asked questions</h2>
          </div>

          <div className="space-y-3">
            {[
              {
                q: "Do I need a credit card to start the free trial?",
                a: "No. Your 14-day trial starts immediately with full access to all features on your chosen plan. You only enter payment details if you decide to continue after the trial ends.",
              },
              {
                q: "Can I cancel anytime?",
                a: "Yes. Cancel at any time from your account settings. There are no cancellation fees, no minimum terms, and no lock-in contracts. If you cancel during your trial, you won't be charged anything.",
              },
              {
                q: "Do the prices include VAT?",
                a: "The listed prices are exclusive of VAT. VAT at 20% is added at checkout. Solo: £70.80 inc VAT. Pro: £118.80 inc VAT. Team: £190.80 inc VAT.",
              },
              {
                q: "Can I upgrade or downgrade my plan?",
                a: "Yes. You can upgrade or downgrade your plan at any time from your account settings. Upgrades take effect immediately; downgrades take effect at the start of your next billing cycle.",
              },
              {
                q: "What happens if I go over my monthly AI quote limit?",
                a: "You can still create unlimited manual quotes. AI-assisted drafting is paused until your limit resets at the start of your next billing cycle, or you can upgrade to a higher plan for more capacity.",
              },
              {
                q: "Is the IT migration appendix available on all plans?",
                a: "The IT migration appendix is available on Pro and Team plans. It's a sector-specific feature for IT service providers and MSPs quoting server migrations, Microsoft 365, Google Workspace, and tenant-merge projects.",
              },
              {
                q: "Can I add more users to my plan?",
                a: "Each plan has a set user limit: Solo (1 user), Pro (2 users), Team (5 users). To add more users, upgrade to the next plan tier.",
              },
              {
                q: "Is my data secure?",
                a: "Yes. Your data — including uploaded documents, voice notes, and proposal content — is stored securely and never shared with third parties. Your quotes and client information remain private to your account.",
              },
            ].map(({ q, a }, i) => (
              <details key={i} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden group">
                <summary className="flex items-center justify-between p-6 font-semibold cursor-pointer list-none" style={{ color: brand.navy }}>
                  <span>{q}</span>
                  <span className="flex-shrink-0 ml-4 text-xl font-bold transition-transform group-open:rotate-45" style={{ color: brand.teal }}>+</span>
                </summary>
                <div className="px-6 pb-6 text-gray-500 text-sm leading-relaxed">
                  {a}
                </div>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA — auth-aware: registered users go to /dashboard, others to /register */}
      <section className="py-20 md:py-28 pub-hero-band text-white relative overflow-hidden">
        <div
          className="absolute inset-0 opacity-5 pointer-events-none"
          style={{
            backgroundImage:
              "repeating-linear-gradient(45deg,transparent,transparent 35px,rgba(255,255,255,0.1) 35px,rgba(255,255,255,0.1) 36px)",
          }}
        />
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10">
          <div className="pub-accent-bar mx-auto" />
          <h2 className="text-3xl sm:text-4xl font-black mb-5">Try it free for 14 days</h2>
          <p className="text-blue-100 text-lg mb-8 max-w-xl mx-auto">
            Full access to all features. No credit card required. Cancel anytime.
          </p>
          {user ? (
            <button
              onClick={() => setLocation("/dashboard")}
              className="inline-flex items-center gap-2 text-white font-bold rounded-xl text-lg shadow-xl hover:opacity-90 transition-all pub-btn-pulse"
              style={{ background: brand.teal, padding: "16px 32px" }}
            >
              Go to Dashboard
              <ArrowRight className="h-5 w-5" />
            </button>
          ) : (
            <button
              onClick={() => setLocation("/register")}
              className="inline-flex items-center gap-2 text-white font-bold rounded-xl text-lg shadow-xl hover:opacity-90 transition-all pub-btn-pulse"
              style={{ background: brand.teal, padding: "16px 32px" }}
            >
              Start Your Free Trial
              <ArrowRight className="h-5 w-5" />
            </button>
          )}
          <p className="mt-4 text-blue-300 text-sm">No credit card required · Cancel anytime</p>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-gray-400 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8 mb-10">
            <div>
              <div className="mb-4 text-2xl font-black text-white">
                IdoYour<span style={{ color: brand.teal }}>Quotes</span>
              </div>
              <p className="text-sm leading-relaxed">
                AI-powered quoting and proposal platform for tradespeople and small businesses.
              </p>
            </div>
            <div>
              <h4 className="text-white font-semibold text-sm mb-3">Product</h4>
              <ul className="space-y-2 text-sm">
                <li><Link href="/features" className="hover:text-[#0d9488] transition-colors">Features</Link></li>
                <li><Link href="/pricing" className="hover:text-[#0d9488] transition-colors">Pricing</Link></li>
                <li><Link href="/register" className="hover:text-[#0d9488] transition-colors">Start Free Trial</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold text-sm mb-3">Company</h4>
              <ul className="space-y-2 text-sm">
                <li><span className="opacity-60">Contact</span></li>
                <li><span className="opacity-60">Privacy Policy</span></li>
                <li><span className="opacity-60">Terms of Service</span></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold text-sm mb-3">Account</h4>
              <ul className="space-y-2 text-sm">
                <li><Link href="/login" className="hover:text-[#0d9488] transition-colors">Sign In</Link></li>
                <li><Link href="/register" className="hover:text-[#0d9488] transition-colors">Register</Link></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-800 pt-6 text-sm text-center">
            © {new Date().getFullYear()} IdoYourQuotes. All rights reserved.
          </div>
        </div>
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
