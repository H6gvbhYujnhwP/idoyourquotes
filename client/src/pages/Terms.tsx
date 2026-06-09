/**
 * Terms of Service — public, no-auth, stable URL at /terms.
 *
 * Companion to Privacy.tsx. Same shell, styling, and footer
 * convention as the other public marketing pages. Public so that
 * the footer link and any ad-platform "terms" requirement can
 * point at a real, no-login URL.
 *
 * Content is the practical draft Wez supplied; placeholders filled
 * with TheGreenAgents.com Ltd contact details. Starting template,
 * not legal advice — Wez will have it reviewed.
 */
import { Link } from "wouter";
import PublicHeader from "@/components/PublicHeader";

const TEAL = "#0d9488";
const NAVY = "#1a2b4a";
const LAST_UPDATED = "9 June 2026";

interface SectionProps {
  number: number;
  title: string;
  children: React.ReactNode;
}

function Section({ number, title, children }: SectionProps) {
  return (
    <section className="mb-8">
      <h2
        className="text-xl sm:text-2xl font-bold mb-3"
        style={{ color: NAVY }}
      >
        {number}. {title}
      </h2>
      <div
        className="text-base leading-relaxed"
        style={{ color: "#374151" }}
      >
        {children}
      </div>
    </section>
  );
}

export default function Terms() {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <PublicHeader currentPage="terms" />

      {/* Hero */}
      <div
        className="border-b border-gray-100"
        style={{ background: "#f8fafc" }}
      >
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
          <h1
            className="text-4xl sm:text-5xl font-black mb-3"
            style={{ color: NAVY }}
          >
            Terms of Service
          </h1>
          <p className="text-sm" style={{ color: "#64748b" }}>
            Last updated: {LAST_UPDATED}
          </p>
        </div>
      </div>

      {/* Body */}
      <main className="flex-1 py-12 sm:py-16">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <Section number={1} title="Agreement">
            By using IdoYourQuotes you agree to these terms. If you
            don't agree, don't use the service.
          </Section>

          <Section number={2} title="The service">
            IdoYourQuotes provides AI-generated first-draft quotes,
            proposals and related documents from information you
            supply. Outputs are starting points that require your own
            review — you are responsible for checking accuracy,
            pricing, technical detail and compliance before relying
            on or sending any document.
          </Section>

          <Section number={3} title="Accounts">
            You must provide accurate details, keep your login secure,
            and are responsible for activity under your account.
          </Section>

          <Section number={4} title="Acceptable use">
            No unlawful, infringing, or abusive use; no attempts to
            disrupt or reverse-engineer the service.
          </Section>

          <Section number={5} title="Trials & billing">
            Free trial as described at sign-up (no card required).
            Paid plans bill per the{" "}
            <Link
              href="/pricing"
              style={{ color: TEAL }}
              className="hover:underline"
            >
              pricing page
            </Link>
            ; fees are non-refundable except where required by law;
            you can cancel anytime and cancellation takes effect at
            the end of the current period.
          </Section>

          <Section number={6} title="Your content">
            You retain ownership of the information you upload and
            the documents you generate. You grant us the licence
            needed to process it and provide the service.
          </Section>

          <Section number={7} title="Intellectual property">
            The platform, software and branding remain ours.
          </Section>

          <Section
            number={8}
            title="No warranty / limitation of liability"
          >
            The service is provided "as is"; to the extent permitted
            by law we exclude implied warranties, and our liability
            is limited as set out here. Nothing limits liability
            that cannot be excluded by law.
          </Section>

          <Section number={9} title="Termination">
            Either party may end the arrangement; we may suspend
            accounts that breach these terms.
          </Section>

          <Section number={10} title="Governing law">
            England and Wales.
          </Section>

          <Section number={11} title="Changes & contact">
            We may update these terms and will post the new version
            here. Questions:{" "}
            <a
              href="mailto:legal@idoyourquotes.com"
              style={{ color: TEAL }}
              className="hover:underline"
            >
              legal@idoyourquotes.com
            </a>
            .
          </Section>

          {/* Trading-entity footnote — required for transparency
              alongside the "the platform … remain ours" clause. */}
          <div
            className="mt-12 pt-6 border-t border-gray-200 text-sm"
            style={{ color: "#64748b" }}
          >
            IdoYourQuotes is operated by TheGreenAgents.com Ltd,
            registered office Lower Barn Farm, London Road,
            Rayleigh, Essex SS6 9ET.
          </div>
        </div>
      </main>

      {/* Footer — inlined to match the convention used by Home,
          Pricing, and Features. */}
      <footer className="bg-gray-900 text-gray-400 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8 mb-10">
            <div>
              <div className="mb-4 text-2xl font-black text-white">
                IdoYour<span style={{ color: TEAL }}>Quotes</span>
              </div>
              <p className="text-sm leading-relaxed">
                AI-powered quoting and proposal platform for
                tradespeople and small businesses.
              </p>
            </div>
            <div>
              <h4 className="text-white font-semibold text-sm mb-3">
                Product
              </h4>
              <ul className="space-y-2 text-sm">
                <li>
                  <Link
                    href="/features"
                    className="hover:text-[#0d9488] transition-colors"
                  >
                    Features
                  </Link>
                </li>
                <li>
                  <Link
                    href="/pricing"
                    className="hover:text-[#0d9488] transition-colors"
                  >
                    Pricing
                  </Link>
                </li>
                <li>
                  <Link
                    href="/register"
                    className="hover:text-[#0d9488] transition-colors"
                  >
                    Start Free Trial
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold text-sm mb-3">
                Company
              </h4>
              <ul className="space-y-2 text-sm">
                <li>
                  <span className="opacity-60">Contact</span>
                </li>
                <li>
                  <Link
                    href="/privacy"
                    className="hover:text-[#0d9488] transition-colors"
                  >
                    Privacy Policy
                  </Link>
                </li>
                <li>
                  <Link
                    href="/terms"
                    className="hover:text-[#0d9488] transition-colors"
                  >
                    Terms of Service
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold text-sm mb-3">
                Account
              </h4>
              <ul className="space-y-2 text-sm">
                <li>
                  <Link
                    href="/login"
                    className="hover:text-[#0d9488] transition-colors"
                  >
                    Sign In
                  </Link>
                </li>
                <li>
                  <Link
                    href="/register"
                    className="hover:text-[#0d9488] transition-colors"
                  >
                    Register
                  </Link>
                </li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-800 pt-6 text-sm text-center">
            © {new Date().getFullYear()} IdoYourQuotes. All rights
            reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
