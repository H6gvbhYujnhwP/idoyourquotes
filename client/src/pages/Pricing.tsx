import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { toast } from "sonner";
import {
  Check,
  X,
  ArrowRight,
  Zap,
  Users,
  Building2,
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
const TIER_RANK: Record<string, number> = { trial: 0, solo: 1, pro: 2, team: 3, business: 4 };
const TIER_PRICES: Record<string, number> = { solo: 59, pro: 99, team: 159, business: 249 };
const TIER_QUOTES: Record<string, number | string> = { solo: 10, pro: 15, team: 50, business: -1 };

function formatPence(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`;
}

export default function Pricing() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [loadingTier, setLoadingTier] = useState<string | null>(null);
  const [confirmTier, setConfirmTier] = useState<'solo' | 'pro' | 'team' | 'business' | null>(null);

  const subStatus = trpc.subscription.status.useQuery(undefined, {
    enabled: !!user,
  });

  // Fetch proration when confirmation modal opens
  const prorationQuery = trpc.subscription.getProration.useQuery(
    { newTier: confirmTier! },
    { enabled: !!confirmTier && !!user, retry: false }
  );

  const createCheckout = trpc.subscription.createCheckout.useMutation({
    onSuccess: (data) => {
      window.location.href = data.url;
    },
    onError: (err) => {
      toast.error(err.message);
      setLoadingTier(null);
    },
  });

  const currentTier = (subStatus.data?.tier || null) as string | null;
  const currentRank = currentTier ? (TIER_RANK[currentTier] ?? 0) : 0;

  const handleSelectTier = (tier: 'solo' | 'pro' | 'team' | 'business') => {
    if (!user) {
      setLocation("/register");
      return;
    }
    const newRank = TIER_RANK[tier] ?? 0;
    const isUpgrade = newRank > currentRank;

    // Only show confirmation modal for upgrades on active subscriptions
    if (isUpgrade && subStatus.data?.status === 'active') {
      setConfirmTier(tier);
      return;
    }

    // New subscriptions or downgrades — go straight to Stripe
    setLoadingTier(tier);
    createCheckout.mutate({ tier });
  };

  const handleConfirmUpgrade = () => {
    if (!confirmTier) return;
    setLoadingTier(confirmTier);
    setConfirmTier(null);
    createCheckout.mutate({ tier: confirmTier });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Nav */}
      <nav className="border-b bg-white sticky top-0 z-50">
        <div className="container flex h-36 items-center justify-between">
          <div className="flex items-center gap-4">
            {user && (
              <Button variant="ghost" size="sm" onClick={() => setLocation("/dashboard")}>
                <ArrowLeft className="h-4 w-4 mr-1" /> Dashboard
              </Button>
            )}
            <img
              src="https://files.manuscdn.com/user_upload_by_module/session_file/310519663048135071/uMprjfIbjwvxZRuj.png"
              alt="IdoYourQuotes"
              className="h-32 object-contain cursor-pointer"
              onClick={() => setLocation("/")}
            />
          </div>
          <div className="flex items-center gap-3">
            {user ? (
              <Button variant="outline" size="sm" onClick={() => setLocation("/dashboard")}>
                Go to Dashboard
              </Button>
            ) : (
              <>
                <Button variant="ghost" size="sm" onClick={() => setLocation("/login")}>
                  Log in
                </Button>
                <Button size="sm" onClick={() => setLocation("/register")}>
                  Get Started Free
                </Button>
              </>
            )}
          </div>
        </div>
      </nav>

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
        <div className="max-w-7xl mx-auto grid md:grid-cols-2 lg:grid-cols-4 gap-6">
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
              "Basic product catalogue (up to 50 items)",
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
            buttonLabel="Get Started"
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
            buttonLabel="Upgrade to Pro"
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
            buttonLabel="Upgrade to Team"
          />

          <TierCard
            name="Business"
            price={249}
            priceWithVat={298.80}
            tagline="For established contractors and multi-user organisations"
            icon={<Building2 className="h-7 w-7 text-amber-300" />}
            color="#d97706"
            borderColor="#d97706"
            bgGradient="linear-gradient(135deg, #1a2b4a 0%, #78350f 100%)"
            whoItsFor={[
              "Larger contracting businesses",
              "Multi-discipline firms",
              "High-volume tendering teams",
              "Complex commercial projects",
            ]}
            limits={[
              "Up to 10 users",
              "Unlimited AI quotes",
              "Advanced project modelling",
            ]}
            buildFrom={[
              "📄 Large multi-set drawing packages",
              "📧 Full tender packs with scope extraction",
              "📝 Complex technical specifications",
              "🖼 Marked-up drawings & layered plans",
              "🎤 Audio briefings & recorded site walks",
              "📂 Bulk file uploads & structured folders",
            ]}
            includes={[
              "Everything in Team",
              "Unlimited AI quotes",
              "Priority AI processing queue",
              "Custom branded proposals",
              "Advanced reporting (future-ready)",
              "Priority support (<24hr response)",
            ]}
            currentTier={currentTier === 'business'}
            onSelect={() => handleSelectTier('business')}
            loading={loadingTier === 'business'}
            buttonLabel="Go Business"
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

      {/* Upgrade confirmation modal */}
      <Dialog open={!!confirmTier} onOpenChange={(open) => { if (!open) setConfirmTier(null); }}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-1">
              <div className="flex items-center justify-center w-10 h-10 rounded-full" style={{ backgroundColor: '#f0fdfa' }}>
                <Crown className="h-5 w-5" style={{ color: '#0d9488' }} />
              </div>
              <DialogTitle className="text-lg">
                Upgrade to {confirmTier ? confirmTier.charAt(0).toUpperCase() + confirmTier.slice(1) : ''}
              </DialogTitle>
            </div>
          </DialogHeader>

          <div className="space-y-3 py-1">
            {/* Quote count reset notice */}
            <div className="flex items-start gap-2 p-3 rounded-lg" style={{ backgroundColor: '#f0fdfa', border: '1px solid #99f6e4' }}>
              <Check className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: '#0d9488' }} />
              <div className="text-sm" style={{ color: '#1a2b4a' }}>
                <p className="font-semibold mb-0.5">Your quote count resets immediately</p>
                <p className="text-xs" style={{ color: '#6b7280' }}>
                  You currently have {subStatus.data?.currentQuoteCount ?? 0} of {subStatus.data?.maxQuotesPerMonth} quotes used this month.
                  Upgrading gives you {confirmTier ? (TIER_QUOTES[confirmTier] === -1 ? 'unlimited' : TIER_QUOTES[confirmTier]) : ''} quotes per month — starting now.
                </p>
              </div>
            </div>

            {/* Proration breakdown */}
            <div className="rounded-lg border p-3 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Billing summary</p>
              {prorationQuery.isLoading ? (
                <div className="flex items-center gap-2 py-2">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Calculating...</span>
                </div>
              ) : prorationQuery.data ? (
                <div className="space-y-1.5 text-sm">
                  {prorationQuery.data.isNewSubscription ? (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Charged today</span>
                      <span className="font-semibold">{formatPence(prorationQuery.data.newMonthlyPence)}</span>
                    </div>
                  ) : (
                    <>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Charged today (pro-rated)</span>
                        <span className="font-semibold">{formatPence(prorationQuery.data.proratedAmountPence)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Then per month from</span>
                        <span className="font-semibold">
                          {prorationQuery.data.nextBillingDate
                            ? new Date(prorationQuery.data.nextBillingDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                            : '—'}
                        </span>
                      </div>
                    </>
                  )}
                  <div className="flex justify-between pt-1 border-t">
                    <span className="text-muted-foreground">Ongoing monthly</span>
                    <span className="font-bold" style={{ color: '#0d9488' }}>{formatPence(prorationQuery.data.newMonthlyPence)}/month</span>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-sm text-amber-600">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  <span>Pricing preview unavailable — you can still proceed.</span>
                </div>
              )}
            </div>

            <p className="text-xs text-muted-foreground">
              All prices shown include VAT where applicable. You'll be taken to our secure payment page to confirm.
            </p>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setConfirmTier(null)} className="w-full sm:w-auto">
              Cancel
            </Button>
            <Button
              onClick={handleConfirmUpgrade}
              disabled={!!loadingTier}
              className="w-full sm:w-auto"
              style={{ backgroundColor: '#0d9488' }}
            >
              {loadingTier ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Confirm & Continue
              <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
