/**
 * DashboardLayout (v2) — top-nav chrome.
 *
 * Replaces the previous collapsible left-sidebar layout. The new shell is:
 *
 *   ┌────────────────────────────────────────────────────┐
 *   │ [logo]          Quotes  Catalog  Settings   [user] │  ← top nav, 64px
 *   ├────────────────────────────────────────────────────┤
 *   │ [SubscriptionBanner — trial / quota / past-due]    │  ← unchanged
 *   ├────────────────────────────────────────────────────┤
 *   │                                                    │
 *   │                    page content                    │
 *   │                                                    │
 *   └────────────────────────────────────────────────────┘
 *
 * Chunk 3 Delivery G — removed the 40px breadcrumb strip that used to sit
 * between the top nav and the subscription banner. It was non-functional
 * display text ("All quotes / Quote") and the top nav already tells the
 * user where they are. Also bumped the top nav from 56px → 64px and the
 * logo from 40px → 48px tall so the brand doesn't feel undersized next
 * to the nav text.
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
import { AlertTriangle, CreditCard, Crown, LogOut } from "lucide-react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";
import SupportFloatingButton from "./SupportFloatingButton";
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

function breadcrumbFor(_location: string): string | null {
  // Chunk 3 Delivery G — breadcrumb strip retired. Kept as a no-op so
  // anything still importing this function doesn't break; can be deleted
  // entirely in a follow-up cleanup once nothing references it.
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

  return (
    <div
      className="flex flex-col min-h-screen"
      style={{ background: "var(--brand-bg)" }}
    >
      {/* ── Top nav ──────────────────────────────────────────────
          Chunk 3 Delivery G — header grew from h-14 (56px) to h-16 (64px)
          and the logo grew from h-10 (40px) to h-12 (48px) so the brand
          no longer feels undersized next to the nav text. The breadcrumb
          strip beneath the top nav has been removed entirely — it was
          non-functional display text and the top nav tabs already tell
          the user where they are. Keep DashboardLayoutSkeleton in sync
          if either of these sizes change. */}
      <header
        className="flex items-center justify-between h-16 px-6 border-b shrink-0"
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
            className="h-12 w-auto object-contain cursor-pointer select-none"
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

      {/* ── Subscription banner (trial / quota / past-due) ─────── */}
      <SubscriptionBanner />

      {/* ── Main content ───────────────────────────────────────── */}
      <main className="flex-1 p-6">{children}</main>

      {/* ── Support bot (Phase 4B Delivery E.13) ───────────────────
          Floating Help button — bottom-right, fixed positioning, shown
          on every authenticated page that's wrapped in DashboardLayout.
          AdminPanel renders without DashboardLayout so the button does
          not appear in the back-office, which is intentional. */}
      <SupportFloatingButton />
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

  // E.24 (May 2026) — verification banner block removed. Email verification
  // is no longer a hard gate at registration (see oauth.ts register handler
  // for full rationale). The DB column stays, this UI does not.

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
