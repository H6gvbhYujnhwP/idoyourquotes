/**
 * DashboardLayout (v2) — top-nav chrome.
 *
 * Replaces the previous collapsible left-sidebar layout. The new shell is:
 *
 *   ┌────────────────────────────────────────────────────┐
 *   │ [logo]          Quotes  Catalog  Settings   [user] │  ← top nav, 56px
 *   ├────────────────────────────────────────────────────┤
 *   │ All quotes                                         │  ← breadcrumb, 40px
 *   ├────────────────────────────────────────────────────┤
 *   │ [SubscriptionBanner — trial / quota / past-due]    │  ← unchanged
 *   ├────────────────────────────────────────────────────┤
 *   │                                                    │
 *   │                    page content                    │
 *   │                                                    │
 *   └────────────────────────────────────────────────────┘
 *
 * Colours, spacing and nav-active styling come from the brand tokens
 * in index.css (`--brand-*`). Shadcn components used inside pages (buttons,
 * dropdowns, dialogs, etc.) continue to resolve through the shadcn OKLCH
 * variables untouched.
 *
 * The logo is still served from the Manus CDN (same URL as the
 * homepage). Migrating to a local asset is tracked for a follow-up
 * cleanup PR — it's a known external dependency.
 */
import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { trpc } from "@/lib/trpc";
import { AlertTriangle, CreditCard, Crown, LogOut, Mail } from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";
import { Button } from "./ui/button";

// Logo — kept on the Manus CDN for Alpha. Flagged in the handover as
// an external dependency to migrate to /public in a follow-up.
const LOGO_URL =
  "https://files.manuscdn.com/user_upload_by_module/session_file/310519663048135071/uMprjfIbjwvxZRuj.png";

// Nav items — three-item nav. `match` covers nested routes so the
// correct tab lights up when a user is deep inside a quote or a
// settings sub-page.
const navItems: Array<{
  label: string;
  path: string;
  match: (loc: string) => boolean;
}> = [
  {
    label: "Quotes",
    path: "/dashboard",
    match: loc => loc === "/dashboard" || loc.startsWith("/quotes"),
  },
  {
    label: "Catalog",
    path: "/catalog",
    match: loc => loc.startsWith("/catalog"),
  },
  {
    label: "Settings",
    path: "/settings",
    match: loc => loc.startsWith("/settings"),
  },
];

function breadcrumbFor(location: string): string | null {
  if (location === "/dashboard") return "All quotes";
  if (location.startsWith("/quotes/")) return "All quotes / Quote";
  if (location.startsWith("/catalog")) return "Catalog";
  if (location.startsWith("/settings")) return "Settings";
  return null;
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { loading, user } = useAuth();

  if (loading) {
    return <DashboardLayoutSkeleton />;
  }

  // Not logged in → redirect to home. Return the skeleton while the
  // browser navigates to avoid a blank flash.
  if (!user) {
    window.location.href = "/";
    return <DashboardLayoutSkeleton />;
  }

  return <DashboardLayoutInner>{children}</DashboardLayoutInner>;
}

function DashboardLayoutInner({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const initials = ((user?.name as string | undefined) || "?")
    .charAt(0)
    .toUpperCase();
  const breadcrumb = breadcrumbFor(location);

  return (
    <div
      className="flex flex-col min-h-screen"
      style={{ background: "var(--brand-bg)" }}
    >
      {/* ── Top nav ────────────────────────────────────────────── */}
      <header
        className="flex items-center justify-between h-14 px-6 border-b shrink-0"
        style={{
          background: "var(--brand-bg)",
          borderColor: "var(--brand-border)",
        }}
      >
        {/* Logo — fixed-width slot so the centre nav stays centred */}
        <div
          className="flex items-center shrink-0"
          style={{ width: 200 }}
        >
          <img
            src={LOGO_URL}
            alt="IdoYourQuotes"
            className="h-10 w-auto object-contain cursor-pointer select-none"
            onClick={() => setLocation("/dashboard")}
            draggable={false}
          />
        </div>

        {/* Centred nav */}
        <nav className="flex items-center gap-1">
          {navItems.map(item => {
            const active = item.match(location);
            return (
              <button
                key={item.path}
                onClick={() => setLocation(item.path)}
                className="px-3 py-1.5 text-sm rounded-md transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                style={{
                  background: active
                    ? "var(--brand-teal-pale)"
                    : "transparent",
                  color: active
                    ? "var(--brand-teal-dark)"
                    : "var(--brand-text-secondary)",
                  fontWeight: active ? 500 : 400,
                }}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Avatar right — fixed-width slot to match the logo slot */}
        <div
          className="flex items-center justify-end shrink-0"
          style={{ width: 200 }}
        >
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-full"
                aria-label="User menu"
              >
                <Avatar className="h-8 w-8">
                  <AvatarFallback
                    style={{
                      background: "var(--brand-teal)",
                      color: "#ffffff",
                      fontSize: "0.75rem",
                      fontWeight: 500,
                    }}
                  >
                    {initials}
                  </AvatarFallback>
                </Avatar>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <div
                className="px-2 py-1.5 text-xs border-b"
                style={{
                  color: "var(--brand-text-tertiary)",
                  borderColor: "var(--brand-border)",
                }}
              >
                <div
                  className="font-medium truncate"
                  style={{ color: "var(--brand-text-primary)" }}
                >
                  {(user?.name as string | undefined) || "—"}
                </div>
                <div className="truncate mt-0.5">
                  {(user?.email as string | undefined) || "—"}
                </div>
              </div>
              <DropdownMenuItem
                onClick={logout}
                className="cursor-pointer text-destructive focus:text-destructive"
              >
                <LogOut className="mr-2 h-4 w-4" />
                <span>Sign out</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* ── Breadcrumb bar ─────────────────────────────────────── */}
      {breadcrumb && (
        <div
          className="flex items-center h-10 px-6 border-b text-xs shrink-0"
          style={{
            background: "var(--brand-bg)",
            borderColor: "var(--brand-border)",
            color: "var(--brand-text-secondary)",
          }}
        >
          {breadcrumb}
        </div>
      )}

      {/* ── Subscription banner (trial / quota / past-due) ─────── */}
      <SubscriptionBanner />

      {/* ── Main content ───────────────────────────────────────── */}
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}

/**
 * SubscriptionBanner — unchanged logic from the v1 layout.
 *
 * Renders a coloured strip above the main content for: email not
 * verified, trial remaining, trial expired, past-due payment,
 * cancel-at-period-end, quota reached, or quota approaching. Returns
 * null when none apply.
 */
function SubscriptionBanner() {
  const [, setLocation] = useLocation();
  const { data: sub } = trpc.subscription.status.useQuery();
  const { user } = useAuth();
  const [resending, setResending] = useState(false);

  // Email verification banner
  if (user && !(user as any).emailVerified) {
    const handleResend = async () => {
      setResending(true);
      try {
        const res = await fetch("/api/auth/resend-verification", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: user.email }),
        });
        if (res.ok) {
          alert("Verification email sent! Check your inbox.");
        } else {
          const data = await res.json();
          alert(data.error || "Failed to resend");
        }
      } catch {
        alert("Failed to resend verification email");
      }
      setResending(false);
    };

    return (
      <div className="flex items-center justify-between px-4 py-2.5 text-sm bg-amber-500 text-white">
        <div className="flex items-center gap-2">
          <Mail className="h-4 w-4" />
          <span className="font-medium">
            Please verify your email to activate your free trial. Check your
            inbox for a verification link.
          </span>
        </div>
        <Button
          size="sm"
          variant="secondary"
          className="h-7 text-xs font-bold"
          onClick={handleResend}
          disabled={resending}
        >
          {resending ? "Sending..." : "Resend Email"}
        </Button>
      </div>
    );
  }

  if (!sub) return null;

  // Trial banner
  if (sub.tier === "trial" && !sub.isTrialExpired && sub.trialDaysRemaining > 0) {
    return (
      <div
        className="flex items-center justify-between px-4 py-2 text-sm"
        style={{ background: "var(--brand-teal)", color: "white" }}
      >
        <div className="flex items-center gap-2">
          <Crown className="h-4 w-4" />
          <span className="font-medium">
            Free trial — {sub.trialDaysRemaining} day
            {sub.trialDaysRemaining !== 1 ? "s" : ""} remaining
          </span>
        </div>
        <Button
          size="sm"
          variant="secondary"
          className="h-7 text-xs font-bold"
          onClick={() => setLocation("/pricing")}
        >
          <CreditCard className="h-3 w-3 mr-1" />
          Choose a plan
        </Button>
      </div>
    );
  }

  // Trial expired
  if (sub.tier === "trial" && sub.isTrialExpired) {
    return (
      <div className="flex items-center justify-between px-4 py-2 text-sm bg-red-600 text-white">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" />
          <span className="font-medium">
            Your free trial has expired. Subscribe to continue using
            IdoYourQuotes.
          </span>
        </div>
        <Button
          size="sm"
          variant="secondary"
          className="h-7 text-xs font-bold"
          onClick={() => setLocation("/pricing")}
        >
          Choose a plan
        </Button>
      </div>
    );
  }

  // Past due
  if (sub.status === "past_due") {
    return (
      <div className="flex items-center justify-between px-4 py-2 text-sm bg-amber-600 text-white">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" />
          <span className="font-medium">
            Payment failed. Please update your payment method to avoid service
            interruption.
          </span>
        </div>
        <Button
          size="sm"
          variant="secondary"
          className="h-7 text-xs font-bold"
          onClick={() => setLocation("/settings?tab=billing")}
        >
          Update payment
        </Button>
      </div>
    );
  }

  // Cancelling at period end
  if (sub.cancelAtPeriodEnd && sub.currentPeriodEnd) {
    const endDate = new Date(sub.currentPeriodEnd).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
    return (
      <div className="flex items-center justify-between px-4 py-2 text-sm bg-gray-700 text-white">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" />
          <span className="font-medium">
            Your {sub.tierName} plan cancels on {endDate}.
          </span>
        </div>
        <Button
          size="sm"
          variant="secondary"
          className="h-7 text-xs font-bold"
          onClick={() => setLocation("/settings?tab=billing")}
        >
          Resume plan
        </Button>
      </div>
    );
  }

  // Quote limit reached — big red banner
  if (
    (sub.maxQuotesPerMonth as number) !== -1 &&
    sub.currentQuoteCount >= sub.maxQuotesPerMonth
  ) {
    return (
      <div className="flex items-center justify-between px-4 py-2.5 text-sm bg-red-600 text-white">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" />
          <span className="font-medium">
            You've used all {sub.maxQuotesPerMonth} quotes this month on your{" "}
            {sub.tierName} plan. Upgrade to keep quoting.
          </span>
        </div>
        <Button
          size="sm"
          variant="secondary"
          className="h-7 text-xs font-bold"
          onClick={() => setLocation("/pricing")}
        >
          Upgrade Now
        </Button>
      </div>
    );
  }

  // Quote limit approaching (80%+) — amber warning
  if (
    (sub.maxQuotesPerMonth as number) !== -1 &&
    sub.maxQuotesPerMonth > 0 &&
    sub.currentQuoteCount >= Math.floor(sub.maxQuotesPerMonth * 0.8)
  ) {
    const remaining = sub.maxQuotesPerMonth - sub.currentQuoteCount;
    return (
      <div className="flex items-center justify-between px-4 py-2 text-sm bg-amber-500 text-white">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" />
          <span className="font-medium">
            {remaining} quote{remaining !== 1 ? "s" : ""} remaining this month
            on your {sub.tierName} plan.
          </span>
        </div>
        <Button
          size="sm"
          variant="secondary"
          className="h-7 text-xs font-bold"
          onClick={() => setLocation("/pricing")}
        >
          View Plans
        </Button>
      </div>
    );
  }

  return null;
}
