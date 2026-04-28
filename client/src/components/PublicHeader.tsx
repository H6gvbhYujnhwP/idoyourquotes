/**
 * PublicHeader
 * ─────────────────────────────────────────────────────────────────
 * Shared sticky header for all public-facing pages (Home, Features,
 * Pricing, Login, Register). Single source of truth for nav items,
 * styling, and auth-aware CTA. Pass `currentPage` so the header can
 * show the active state (teal border + weight) on the current link
 * and suppress duplicate self-links/CTAs where appropriate.
 *
 * Login: hides "Sign In" link (we're on it).
 * Register: hides the "Start Free Trial" CTA (they're already here).
 * Logged-in users: nav swaps Sign In → Dashboard, CTA → Go to Dashboard.
 */
import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { ArrowRight, Menu, X } from "lucide-react";

const TEAL = "#0d9488";

export type PublicPage = "home" | "features" | "pricing" | "login" | "register";

interface Props {
  currentPage: PublicPage;
}

interface NavLinkProps {
  href: string;
  label: string;
  active: boolean;
}

function NavLink({ href, label, active }: NavLinkProps) {
  const baseStyle: React.CSSProperties = {
    fontSize: 18,
    padding: "18px 16px",
    borderRadius: 9,
    textDecoration: "none",
    whiteSpace: "nowrap",
    transition: "border-color .2s, color .2s",
  };
  const activeStyle: React.CSSProperties = {
    ...baseStyle,
    color: TEAL,
    fontWeight: 600,
    border: `1px solid ${TEAL}`,
  };
  const inactiveStyle: React.CSSProperties = {
    ...baseStyle,
    color: "#464646",
    fontWeight: 500,
    border: "1px solid transparent",
  };

  return (
    <Link
      href={href}
      style={active ? activeStyle : inactiveStyle}
      onMouseOver={(e) => {
        if (!active) e.currentTarget.style.borderColor = "#464646";
      }}
      onMouseOut={(e) => {
        if (!active) e.currentTarget.style.borderColor = "transparent";
      }}
    >
      {label}
    </Link>
  );
}

export default function PublicHeader({ currentPage }: Props) {
  const { user, loading } = useAuth();
  const [, setLocation] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Decide what the right-side CTA should do/say.
  // 1. While auth is loading -> show nothing (avoids flash).
  // 2. Logged in -> "Go to Dashboard"
  // 3. Logged out, on register page -> hide CTA (avoids self-link)
  // 4. Logged out, anywhere else -> "Start Free Trial"
  const showCta = !loading && !(currentPage === "register" && !user);
  const ctaIsDashboard = !!user;
  const ctaLabel = ctaIsDashboard ? "Go to Dashboard" : "Start Free Trial";
  const ctaHref = ctaIsDashboard ? "/dashboard" : "/register";

  // Decide which nav items to render.
  const showFeatures = true;
  const showPricing = true;
  const showSignIn = !user && currentPage !== "login";
  const showDashboard = !!user; // logged-in users see a "Dashboard" link

  return (
    <header className="sticky top-0 z-50 pub-sticky-nav">
      <div
        className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between"
        style={{ height: 100 }}
      >
        {/* Logo */}
        <Link
          href="/"
          aria-label="IdoYourQuotes home"
          className="inline-block flex-shrink-0"
          style={{ height: 65 }}
        >
          <img
            src="https://files.manuscdn.com/user_upload_by_module/session_file/310519663048135071/uMprjfIbjwvxZRuj.png"
            alt="IdoYourQuotes logo"
            style={{ height: 65, width: "auto", objectFit: "contain" }}
          />
        </Link>

        {/* Desktop nav */}
        <nav
          className="hidden md:flex items-center"
          style={{ gap: 10 }}
          aria-label="Main navigation"
        >
          {showFeatures && (
            <NavLink href="/features" label="Features" active={currentPage === "features"} />
          )}
          {showPricing && (
            <NavLink href="/pricing" label="Pricing" active={currentPage === "pricing"} />
          )}
          {showSignIn && (
            <NavLink href="/login" label="Sign In" active={false} />
          )}
          {showDashboard && <NavLink href="/dashboard" label="Dashboard" active={false} />}
        </nav>

        {/* Right side: CTA (desktop) + mobile burger */}
        <div className="flex items-center gap-2">
          {showCta && (
            <button
              type="button"
              onClick={() => setLocation(ctaHref)}
              className="hidden md:inline-flex items-center gap-2 text-white font-semibold pub-btn-pulse"
              style={{
                background: TEAL,
                fontSize: 18,
                padding: "18px 24px",
                borderRadius: 9,
              }}
            >
              {ctaLabel}
              <ArrowRight className="h-[18px] w-[18px]" />
            </button>
          )}

          <button
            type="button"
            className="md:hidden p-2 text-gray-600"
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen((v) => !v)}
          >
            {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden border-t border-gray-100 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex flex-col gap-1">
            {showFeatures && (
              <Link
                href="/features"
                onClick={() => setMobileOpen(false)}
                className="px-3 py-3 rounded-lg text-base font-medium hover:bg-slate-50"
                style={{
                  color: currentPage === "features" ? TEAL : "#1a2b4a",
                  fontWeight: currentPage === "features" ? 600 : 500,
                }}
              >
                Features
              </Link>
            )}
            {showPricing && (
              <Link
                href="/pricing"
                onClick={() => setMobileOpen(false)}
                className="px-3 py-3 rounded-lg text-base font-medium hover:bg-slate-50"
                style={{
                  color: currentPage === "pricing" ? TEAL : "#1a2b4a",
                  fontWeight: currentPage === "pricing" ? 600 : 500,
                }}
              >
                Pricing
              </Link>
            )}
            {showSignIn && (
              <Link
                href="/login"
                onClick={() => setMobileOpen(false)}
                className="px-3 py-3 rounded-lg text-base font-medium hover:bg-slate-50"
                style={{ color: "#1a2b4a" }}
              >
                Sign In
              </Link>
            )}
            {showDashboard && (
              <Link
                href="/dashboard"
                onClick={() => setMobileOpen(false)}
                className="px-3 py-3 rounded-lg text-base font-medium hover:bg-slate-50"
                style={{ color: "#1a2b4a" }}
              >
                Dashboard
              </Link>
            )}
            {showCta && (
              <button
                type="button"
                onClick={() => {
                  setMobileOpen(false);
                  setLocation(ctaHref);
                }}
                className="mt-2 inline-flex items-center justify-center gap-2 text-white font-semibold py-3 rounded-lg"
                style={{ background: TEAL }}
              >
                {ctaLabel}
                <ArrowRight className="h-[18px] w-[18px]" />
              </button>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
