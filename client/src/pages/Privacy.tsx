/**
 * Privacy Policy — public, no-auth, stable URL at /privacy.
 *
 * This page is the canonical destination for the Privacy Policy link
 * in our advertising (notably Facebook/Meta lead ads) and in the
 * footer Company column on Home, Pricing, and Features. It must load
 * with no login, on a stable URL, and look at home in the site's
 * existing brand styling (navy/teal on white, dark footer).
 *
 * Structure mirrors the other public marketing pages: shared
 * <PublicHeader>, a centred prose-width content column, then the
 * inlined dark gray-900 footer used across Home/Pricing/Features.
 *
 * Content is the practical draft Wez supplied; placeholders filled
 * with TheGreenAgents.com Ltd (the legal entity operating
 * IdoYourQuotes) and its registered office. Wez has flagged this is
 * a starting template, not legal advice, and will have it reviewed.
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

export default function Privacy() {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <PublicHeader currentPage="privacy" />

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
            Privacy Policy
          </h1>
          <p className="text-sm" style={{ color: "#64748b" }}>
            Last updated: {LAST_UPDATED}
          </p>
        </div>
      </div>

      {/* Body */}
      <main className="flex-1 py-12 sm:py-16">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <Section number={1} title="Who we are">
            IdoYourQuotes ("we", "us") is an AI-powered quoting and
            proposal platform operated by TheGreenAgents.com Ltd,
            registered office Lower Barn Farm, London Road, Rayleigh,
            Essex SS6 9ET, contact{" "}
            <a
              href="mailto:privacy@idoyourquotes.com"
              style={{ color: TEAL }}
              className="hover:underline"
            >
              privacy@idoyourquotes.com
            </a>
            . For UK data-protection law we are the data controller for
            the personal data described here.
          </Section>

          <Section number={2} title="What we collect">
            <p className="mb-2">
              <strong style={{ color: NAVY }}>(a) Account data</strong>{" "}
              — name, email, password, company details.
            </p>
            <p className="mb-2">
              <strong style={{ color: NAVY }}>
                (b) Content you provide
              </strong>{" "}
              — client briefs, notes, documents and other input you
              upload to generate quotes/proposals.
            </p>
            <p className="mb-2">
              <strong style={{ color: NAVY }}>
                (c) Enquiry/lead data
              </strong>{" "}
              — if you contact us or submit a form (including forms on
              our Facebook/Instagram ads), the name, email, phone
              number and any message you provide.
            </p>
            <p>
              <strong style={{ color: NAVY }}>
                (d) Usage and device data
              </strong>{" "}
              — IP address, browser, pages visited, collected via
              cookies and similar technologies.
            </p>
          </Section>

          <Section number={3} title="How we use it">
            To provide and operate the service, generate your
            first-draft documents, manage your account and billing,
            respond to enquiries, improve the product, send service
            and (where permitted) marketing messages, and meet legal
            obligations.
          </Section>

          <Section number={4} title="Legal bases (UK GDPR)">
            Performance of our contract with you; your consent (e.g.
            marketing, ad lead forms); our legitimate interests in
            running and improving the service; and legal compliance.
          </Section>

          <Section number={5} title="AI processing">
            We use third-party AI providers to generate draft content
            from the information you submit. Outputs are first drafts
            intended for human review.
          </Section>

          <Section number={6} title="Facebook/Meta lead ads">
            If you submit your details through one of our ads, Meta
            passes that information to us so we can contact you about
            IdoYourQuotes. We handle it under this policy.
          </Section>

          <Section number={7} title="Sharing">
            We share data only with service providers who help us run
            the platform (e.g. hosting, payment processing, AI
            processing, analytics, email) under appropriate
            agreements, and where required by law. We do not sell
            your personal data.
          </Section>

          <Section number={8} title="Cookies">
            We use essential and analytics cookies; see your browser
            settings to control them.
          </Section>

          <Section number={9} title="Retention">
            We keep personal data only as long as needed for the
            purposes above or as required by law.
          </Section>

          <Section number={10} title="Your rights">
            Under UK GDPR you can request access, correction, deletion,
            restriction, portability, and object to certain processing.
            Contact{" "}
            <a
              href="mailto:privacy@idoyourquotes.com"
              style={{ color: TEAL }}
              className="hover:underline"
            >
              privacy@idoyourquotes.com
            </a>
            . You can also complain to the UK ICO (
            <a
              href="https://ico.org.uk"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: TEAL }}
              className="hover:underline"
            >
              ico.org.uk
            </a>
            ).
          </Section>

          <Section number={11} title="Security & transfers">
            We use appropriate technical and organisational measures.
            Where data is processed outside the UK, we use lawful
            safeguards.
          </Section>

          <Section number={12} title="Children">
            The service is not intended for under-18s.
          </Section>

          <Section number={13} title="Changes">
            We may update this policy and will post the new version
            here.
          </Section>
        </div>
      </main>

      {/* Footer — inlined to match the convention used by Home,
          Pricing, and Features. A future refactor could lift this
          into a shared <PublicFooter /> component; out of scope here. */}
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
