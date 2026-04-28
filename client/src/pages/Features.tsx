import { Link, useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import PublicHeader from "@/components/PublicHeader";
import {
  ArrowRight,
  CheckCircle2,
  Mic,
  Server,
  Bookmark,
  FileText,
  BookOpen,
} from "lucide-react";

const TEAL = "#0d9488";
const NAVY = "#1a2b4a";

/* ─── small inline UI helpers ─── */

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="inline-block text-xs font-bold uppercase tracking-wide rounded-full"
      style={{
        background: "rgba(13,148,136,0.12)",
        color: TEAL,
        padding: "0.2rem 0.6rem",
        letterSpacing: "0.05em",
      }}
    >
      {children}
    </span>
  );
}

function FileChip({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 bg-white border border-gray-200 rounded-md text-xs font-semibold"
      style={{ color: NAVY, padding: "0.35rem 0.75rem" }}
    >
      {children}
    </span>
  );
}

function CheckRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <CheckCircle2 className="h-[18px] w-[18px] mt-0.5 flex-shrink-0" style={{ color: TEAL }} />
      <span className="text-sm text-gray-600">{children}</span>
    </div>
  );
}

export default function Features() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  const handleGetStarted = () => {
    if (user) setLocation("/dashboard");
    else setLocation("/register");
  };

  const schemaLD = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "IdoYourQuotes",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    featureList: [
      "Voice dictation for quotes",
      "Drag-and-drop evidence processing",
      "Catalogue-backed line items",
      "Branded proposal templates",
      "IT migration appendix",
      "Smart defaults",
      "Quick PDF and Contract output modes",
    ],
    url: "https://www.idoyourquotes.com/features",
  };

  return (
    <div className="min-h-screen bg-white text-gray-900 font-sans antialiased">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schemaLD) }} />

      <PublicHeader currentPage="features" />

      {/* ============================================================
           HERO BAND
         ============================================================ */}
      <section className="pub-hero-band text-white py-16 md:py-24 relative overflow-hidden">
        <div
          className="absolute inset-0 opacity-5 pointer-events-none"
          style={{
            backgroundImage:
              "repeating-linear-gradient(0deg,transparent,transparent 39px,rgba(255,255,255,0.3) 39px,rgba(255,255,255,0.3) 40px), repeating-linear-gradient(90deg,transparent,transparent 39px,rgba(255,255,255,0.3) 39px,rgba(255,255,255,0.3) 40px)",
          }}
        />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="pub-accent-bar" />
          <h1 className="text-4xl sm:text-5xl font-black leading-tight max-w-3xl pub-anim-fade-up">
            Everything IdoYourQuotes does — and why it matters
          </h1>
          <p className="mt-5 text-blue-100 text-lg max-w-2xl pub-anim-fade-up pub-delay-200">
            This is the full feature set. Not a summary — every capability explained, with real examples from the four sectors we're built for.
          </p>

          {/* Quick-jump nav */}
          <div className="mt-8 flex flex-wrap gap-2 pub-anim-fade-up pub-delay-300">
            {[
              ["#voice", "Voice Dictation"],
              ["#evidence", "Evidence Drop"],
              ["#catalogue", "Catalogue"],
              ["#branded", "Branded Proposals"],
              ["#defaults", "Smart Defaults"],
              ["#migration", "IT Migration"],
              ["#output", "Output Modes"],
              ["#company", "Company Defaults"],
              ["#sectors", "Sector Showcase"],
            ].map(([href, label]) => (
              <a
                key={href}
                href={href}
                className="inline-block text-xs font-bold uppercase tracking-wide rounded-full text-white transition-colors"
                style={{
                  background: "rgba(255,255,255,0.10)",
                  padding: "0.3rem 0.75rem",
                  letterSpacing: "0.05em",
                }}
                onMouseOver={(e) => { e.currentTarget.style.background = "rgba(13,148,136,0.30)"; }}
                onMouseOut={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.10)"; }}
              >
                {label}
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* ============================================================
           1. VOICE DICTATION  (white bg)
         ============================================================ */}
      <section id="voice" className="py-16 md:py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <Tag>Feature 1</Tag>
              <div className="pub-accent-bar mt-3" />
              <h2 className="text-3xl sm:text-4xl font-black mb-4" style={{ color: NAVY }}>
                Voice Dictation
              </h2>
              <p className="text-gray-600 leading-relaxed mb-5">
                Walk back from a site visit, talk into your phone, and the system writes the quote. No notes, no keyboard, no blank page waiting for you at the office.
              </p>
              <p className="text-gray-600 leading-relaxed mb-6">
                The dictation is transcribed, structured, and mapped to your catalogue line items automatically. A pest control technician can quote an annual service contract from a 90-second voice note recorded in the car park.
              </p>
              <div className="space-y-3">
                <CheckRow>Supports audio recordings and live dictation</CheckRow>
                <CheckRow>Transcription mapped to scope, quantities, and client details</CheckRow>
                <CheckRow>Works on mobile — record on-site, quote is ready when you're back at your desk</CheckRow>
              </div>
            </div>

            {/* Voice note mockup */}
            <div className="rounded-2xl p-8 text-white shadow-xl" style={{ background: NAVY }}>
              <div className="flex items-center gap-3 mb-6">
                <div className="pub-icon-circle">
                  <Mic className="h-6 w-6" style={{ color: TEAL }} />
                </div>
                <div>
                  <div className="font-bold text-sm">Voice Note</div>
                  <div className="text-blue-300 text-xs">client_call_notes.m4a · 1m 42s</div>
                </div>
                <div className="ml-auto text-xs font-bold" style={{ color: TEAL }}>✓ Analysed</div>
              </div>
              <div className="rounded-xl p-5 text-sm leading-relaxed text-blue-100" style={{ background: "rgba(255,255,255,0.05)" }}>
                <div className="font-bold text-xs mb-2 uppercase tracking-wide" style={{ color: TEAL }}>
                  Extracted from voice note
                </div>
                <p className="mb-2"><span className="text-white font-semibold">Client:</span> Riverside Business Park, Unit 12</p>
                <p className="mb-2"><span className="text-white font-semibold">Scope:</span> Annual pest control contract — rodent bait stations × 8, quarterly inspection visits × 4</p>
                <p className="mb-2"><span className="text-white font-semibold">Exclusions:</span> Structural works, bird deterrent</p>
                <p><span className="text-white font-semibold">Notes:</span> Client requested treatment schedule in proposal</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================
           2. DRAG-AND-DROP EVIDENCE  (slate bg)
         ============================================================ */}
      <section id="evidence" className="py-16 md:py-24" style={{ background: "#f1f5f9" }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* File types card */}
            <div className="order-2 lg:order-1">
              <div className="bg-white rounded-2xl p-8 shadow-lg border border-gray-100">
                <div className="font-bold text-sm mb-5 uppercase tracking-wide" style={{ color: NAVY }}>
                  Accepted file types
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    ["📄", "PDF Tenders", "Scope, quantities, requirements extracted automatically"],
                    ["📧", ".eml / .msg Emails", "Full email threads → client requirements and scope"],
                    ["🖼️", "Photos & Drawings", "Site plans, dimensions, and layouts captured"],
                    ["🎤", "Audio Recordings", "Voice notes and call recordings transcribed instantly"],
                    ["📝", "Word Documents", "Specifications, briefs, and scopes of work"],
                    ["💬", "Pasted Text", "Email copy, WhatsApp messages, any text brief"],
                  ].map(([emoji, title, body]) => (
                    <div key={title} className="rounded-xl p-4" style={{ background: "#f1f5f9" }}>
                      <div className="text-2xl mb-2" aria-hidden="true">{emoji}</div>
                      <div className="font-bold text-sm" style={{ color: NAVY }}>{title}</div>
                      <div className="text-gray-400 text-xs mt-1">{body}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="order-1 lg:order-2">
              <Tag>Feature 2</Tag>
              <div className="pub-accent-bar mt-3" />
              <h2 className="text-3xl sm:text-4xl font-black mb-4" style={{ color: NAVY }}>
                Drag-and-Drop Evidence
              </h2>
              <p className="text-gray-600 leading-relaxed mb-5">
                Drop in whatever you've got — tender PDFs, site photos, email threads, voice recordings, Word specs — and the system reads them all. No re-typing, no reformatting.
              </p>
              <p className="text-gray-600 leading-relaxed mb-6">
                An MSP can drop in a 40-page tender pack and a 2-minute voice note, and the system extracts scope, quantities, client details, and maps them to a structured proposal draft. What used to take two days now takes five minutes.
              </p>
              <div
                className="rounded-xl p-5"
                style={{ background: "rgba(13,148,136,0.10)", border: "1px solid rgba(13,148,136,0.20)" }}
              >
                <div className="font-bold text-sm mb-2" style={{ color: TEAL }}>Real example</div>
                <p className="text-gray-600 text-sm leading-relaxed">
                  A 26-user IT support proposal with managed services, M365, hosting, and migration appendix — produced from a tender pack PDF and a 2-minute voice note. Output: 8-page branded proposal, ready to send.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================
           3. CATALOGUE-BACKED LINE ITEMS  (white bg)
         ============================================================ */}
      <section id="catalogue" className="py-16 md:py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <Tag>Feature 3</Tag>
              <div className="pub-accent-bar mt-3" />
              <h2 className="text-3xl sm:text-4xl font-black mb-4" style={{ color: NAVY }}>
                Catalogue-Backed Line Items
              </h2>
              <p className="text-gray-600 leading-relaxed mb-5">
                Your own products and services feed straight into the draft. When the system identifies a scope item, it matches it to your catalogue — so prices and descriptions match what you actually sell, not generic placeholders.
              </p>
              <p className="text-gray-600 leading-relaxed mb-6">
                A commercial cleaning firm can respond to a tender for office cleaning with every line item rate pulled directly from their catalogue. No manual pricing lookups, no copy-paste errors.
              </p>
              <div className="space-y-3">
                <CheckRow>Solo plan: up to 100 catalogue items</CheckRow>
                <CheckRow>Pro/Team: shared team catalogue, unlimited items</CheckRow>
                <CheckRow>Prices and descriptions match your actual rates — always</CheckRow>
              </div>
            </div>

            {/* Catalogue mockup */}
            <div className="rounded-2xl p-8 shadow-sm border border-gray-100" style={{ background: "#f1f5f9" }}>
              <div className="font-bold text-sm mb-4 uppercase tracking-wide" style={{ color: NAVY }}>
                Catalogue → Draft line items
              </div>
              <div className="space-y-3">
                {[
                  ["Monthly Office Cleaning — Standard", "Per visit · 4 visits/month", "£280.00"],
                  ["Deep Clean — Quarterly", "Per session · includes consumables", "£650.00"],
                  ["Window Cleaning — External", "Per visit · up to 3 storeys", "£120.00"],
                ].map(([title, sub, price]) => (
                  <div key={title} className="bg-white rounded-xl p-4 flex items-center justify-between shadow-sm">
                    <div>
                      <div className="font-semibold text-sm" style={{ color: NAVY }}>{title}</div>
                      <div className="text-gray-400 text-xs">{sub}</div>
                    </div>
                    <div className="font-bold text-sm" style={{ color: TEAL }}>{price}</div>
                  </div>
                ))}
                <div
                  className="rounded-xl p-3 text-center text-xs font-bold"
                  style={{ background: "rgba(13,148,136,0.10)", color: TEAL }}
                >
                  ✓ All rates pulled from your catalogue automatically
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================
           4. BRANDED PROPOSALS  (slate bg)
         ============================================================ */}
      <section id="branded" className="py-16 md:py-24" style={{ background: "#f1f5f9" }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Template thumbnails */}
            <div className="order-2 lg:order-1">
              <div className="grid grid-cols-3 gap-4">
                {/* Modern */}
                <div className="pub-card-lift">
                  <div className="rounded-xl overflow-hidden shadow-lg aspect-[3/4] flex flex-col" style={{ background: NAVY }}>
                    <div className="h-2" style={{ background: TEAL }} />
                    <div className="flex-1 p-3 flex flex-col justify-between">
                      <div>
                        <div className="rounded h-2 w-3/4 mb-1.5" style={{ background: "rgba(255,255,255,0.20)" }} />
                        <div className="rounded h-1.5 w-1/2 mb-3" style={{ background: "rgba(255,255,255,0.10)" }} />
                        <div className="space-y-1">
                          <div className="rounded h-1 w-full" style={{ background: "rgba(255,255,255,0.10)" }} />
                          <div className="rounded h-1 w-5/6" style={{ background: "rgba(255,255,255,0.10)" }} />
                          <div className="rounded h-1 w-4/5" style={{ background: "rgba(255,255,255,0.10)" }} />
                        </div>
                      </div>
                      <div className="rounded h-1.5 w-1/3" style={{ background: "rgba(13,148,136,0.30)" }} />
                    </div>
                  </div>
                  <div className="text-center mt-2 text-xs font-bold" style={{ color: NAVY }}>Modern</div>
                </div>
                {/* Structured */}
                <div className="pub-card-lift">
                  <div className="rounded-xl overflow-hidden shadow-lg border border-gray-200 aspect-[3/4] flex flex-col" style={{ background: "#f1f5f9" }}>
                    <div className="h-8 flex items-center px-3" style={{ background: NAVY }}>
                      <div className="rounded h-1.5 w-1/2" style={{ background: "rgba(255,255,255,0.30)" }} />
                    </div>
                    <div className="flex-1 p-3 flex flex-col justify-between">
                      <div className="space-y-2">
                        <div className="rounded h-1.5 w-3/4" style={{ background: "rgba(26,43,74,0.10)" }} />
                        <div className="border-l-2 pl-2 space-y-1" style={{ borderColor: TEAL }}>
                          <div className="rounded h-1 w-full" style={{ background: "rgba(26,43,74,0.10)" }} />
                          <div className="rounded h-1 w-5/6" style={{ background: "rgba(26,43,74,0.10)" }} />
                        </div>
                        <div className="rounded h-1.5 w-2/3" style={{ background: "rgba(26,43,74,0.10)" }} />
                      </div>
                      <div className="rounded h-1.5 w-1/3" style={{ background: "rgba(26,43,74,0.10)" }} />
                    </div>
                  </div>
                  <div className="text-center mt-2 text-xs font-bold" style={{ color: NAVY }}>Structured</div>
                </div>
                {/* Bold */}
                <div className="pub-card-lift">
                  <div className="bg-white rounded-xl overflow-hidden shadow-lg border border-gray-200 aspect-[3/4] flex flex-col">
                    <div className="h-10 flex items-end px-3 pb-2" style={{ background: TEAL }}>
                      <div className="rounded h-2 w-2/3" style={{ background: "rgba(255,255,255,0.60)" }} />
                    </div>
                    <div className="flex-1 p-3 flex flex-col justify-between">
                      <div className="space-y-2">
                        <div className="rounded h-2 w-3/4" style={{ background: NAVY }} />
                        <div className="space-y-1">
                          <div className="bg-gray-200 rounded h-1 w-full" />
                          <div className="bg-gray-200 rounded h-1 w-5/6" />
                          <div className="bg-gray-200 rounded h-1 w-4/5" />
                        </div>
                      </div>
                      <div className="rounded h-2 w-1/3" style={{ background: TEAL }} />
                    </div>
                  </div>
                  <div className="text-center mt-2 text-xs font-bold" style={{ color: NAVY }}>Bold</div>
                </div>
              </div>
              <p className="text-center text-xs text-gray-400 mt-4">Three template styles — Modern, Structured, Bold</p>
            </div>

            <div className="order-1 lg:order-2">
              <Tag>Feature 4</Tag>
              <div className="pub-accent-bar mt-3" />
              <h2 className="text-3xl sm:text-4xl font-black mb-4" style={{ color: NAVY }}>
                Branded Proposals
              </h2>
              <p className="text-gray-600 leading-relaxed mb-5">
                Every proposal includes a cover page, executive summary, scope of works, pricing tables, terms and conditions, and a signature block. Your logo and brand colours are pulled automatically from your website URL — no manual setup.
              </p>
              <p className="text-gray-600 leading-relaxed mb-6">
                Choose from three template styles — Modern, Structured, or Bold — to match how your business presents itself. The result looks like it was designed by a professional, not typed in Word at 11pm.
              </p>
              <div
                className="rounded-xl p-5"
                style={{ background: "rgba(13,148,136,0.10)", border: "1px solid rgba(13,148,136,0.20)" }}
              >
                <div className="font-bold text-sm mb-2" style={{ color: TEAL }}>What's included in every proposal</div>
                <div className="grid grid-cols-2 gap-2 text-sm text-gray-600">
                  <span>✓ Cover page</span>
                  <span>✓ Executive summary</span>
                  <span>✓ Scope of works</span>
                  <span>✓ Pricing tables</span>
                  <span>✓ Terms &amp; conditions</span>
                  <span>✓ Signature block</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================
           5. SMART DEFAULTS  (white bg)
         ============================================================ */}
      <section id="defaults" className="py-16 md:py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <Tag>Feature 5</Tag>
              <div className="pub-accent-bar mt-3" />
              <h2 className="text-3xl sm:text-4xl font-black mb-4" style={{ color: NAVY }}>
                Smart Defaults That Learn
              </h2>
              <p className="text-gray-600 leading-relaxed mb-5">
                Edit a section once — your standard payment terms, your VAT clause, your exclusions wording — tick "save as default", and every future quote pre-fills with that exact wording. No more retyping the same boilerplate on every job.
              </p>
              <p className="text-gray-600 leading-relaxed mb-6">
                The system remembers how you work. The more you use it, the less you have to type. Most users find their quote drafts need minimal editing within the first week.
              </p>
              <div className="flex items-center gap-3 rounded-xl p-4" style={{ background: "#f1f5f9" }}>
                <Bookmark className="h-6 w-6 flex-shrink-0" style={{ color: TEAL }} />
                <p className="text-sm text-gray-600">
                  <strong style={{ color: NAVY }}>Edit once, save as default.</strong>{" "}
                  Every future quote pre-fills with your wording — terms, exclusions, payment conditions, all of it.
                </p>
              </div>
            </div>

            {/* Defaults mockup */}
            <div className="bg-white rounded-2xl p-8 shadow-lg border border-gray-100">
              <div className="font-bold text-sm mb-5 uppercase tracking-wide" style={{ color: NAVY }}>
                Saved defaults
              </div>
              <div className="space-y-4">
                {[
                  ["Payment Terms", "Payment due within 30 days of invoice date. Late payments subject to 2% monthly interest."],
                  ["Validity Period", "This quotation is valid for 30 days from the date of issue."],
                  ["Insurance Limits", "Public liability insurance: £5,000,000. Employers liability: £10,000,000."],
                ].map(([title, body]) => (
                  <div key={title} className="border border-gray-100 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-semibold text-sm" style={{ color: NAVY }}>{title}</span>
                      <Tag>Default</Tag>
                    </div>
                    <p className="text-gray-500 text-xs leading-relaxed">{body}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================
           6. IT MIGRATION APPENDIX  (slate bg)
         ============================================================ */}
      <section id="migration" className="py-16 md:py-24" style={{ background: "#f1f5f9" }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Appendix mockup */}
            <div className="order-2 lg:order-1">
              <div className="rounded-2xl p-8 text-white shadow-xl" style={{ background: NAVY }}>
                <div className="flex items-center gap-3 mb-6">
                  <div className="pub-icon-circle">
                    <Server className="h-6 w-6" style={{ color: TEAL }} />
                  </div>
                  <div>
                    <div className="font-bold text-sm">IT Migration Appendix</div>
                    <div className="text-blue-300 text-xs">Auto-generated · 6 sections</div>
                  </div>
                </div>
                <div className="space-y-2">
                  {[
                    "Migration Methodology",
                    "Project Phases & Timeline",
                    "Assumptions & Dependencies",
                    "Risk Register",
                    "Rollback Plan",
                    "Out-of-Scope Items",
                  ].map((label, i) => (
                    <div key={label} className="rounded-lg p-3 flex items-center gap-3" style={{ background: "rgba(255,255,255,0.10)" }}>
                      <span className="font-bold text-xs w-4" style={{ color: TEAL }}>{i + 1}</span>
                      <span className="text-sm">{label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="order-1 lg:order-2">
              <Tag>Feature 6 · MSP-specific</Tag>
              <div className="pub-accent-bar mt-3" />
              <h2 className="text-3xl sm:text-4xl font-black mb-4" style={{ color: NAVY }}>
                IT Migration Appendix
              </h2>
              <p className="text-gray-600 leading-relaxed mb-5">
                For IT service providers and MSPs quoting server migrations, Microsoft 365 deployments, Google Workspace moves, or tenant merges — IdoYourQuotes auto-generates a six-section migration appendix tailored to the migration type.
              </p>
              <p className="text-gray-600 leading-relaxed mb-6">
                No other quoting tool does this. The appendix covers methodology, project phases, assumptions, risk register, rollback plan, and out-of-scope items — the exact sections a client procurement team expects to see in a formal IT tender response.
              </p>
              <div className="flex flex-wrap gap-2">
                <FileChip>Server Migration</FileChip>
                <FileChip>Microsoft 365</FileChip>
                <FileChip>Google Workspace</FileChip>
                <FileChip>Tenant Merge</FileChip>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================
           7. TWO OUTPUT MODES  (white bg, centred)
         ============================================================ */}
      <section id="output" className="py-16 md:py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <Tag>Feature 7</Tag>
            <div className="pub-accent-bar mx-auto mt-3" />
            <h2 className="text-3xl sm:text-4xl font-black mb-4" style={{ color: NAVY }}>
              Two Output Modes
            </h2>
            <p className="text-gray-500 text-lg">
              Not every job needs an 8-page proposal. Choose the format that fits the situation.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {/* Quick PDF */}
            <div className="rounded-2xl p-8 pub-card-lift border border-gray-100" style={{ background: "#f1f5f9" }}>
              <div className="pub-icon-circle mb-5">
                <FileText className="h-6 w-6" style={{ color: TEAL }} />
              </div>
              <h3 className="text-xl font-bold mb-2" style={{ color: NAVY }}>Quick PDF</h3>
              <p className="text-gray-500 text-sm leading-relaxed mb-5">
                One-page essentials: scope summary, pricing, key terms, and your contact details. For fast responses to smaller jobs where a full proposal would be overkill.
              </p>
              <div className="text-xs font-bold uppercase tracking-wide" style={{ color: TEAL }}>Best for</div>
              <p className="text-sm text-gray-500 mt-1">Domestic jobs, repeat clients, quick turnaround quotes</p>
            </div>

            {/* Contract / Tender */}
            <div className="rounded-2xl p-8 pub-card-lift text-white" style={{ background: NAVY }}>
              <div className="pub-icon-circle mb-5">
                <BookOpen className="h-6 w-6" style={{ color: TEAL }} />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">Contract / Tender</h3>
              <p className="text-blue-200 text-sm leading-relaxed mb-5">
                Multi-page branded proposal: cover page, executive summary, full scope, pricing tables, terms, signature block, and (for IT MSPs) the migration appendix. For formal bids and commercial tenders.
              </p>
              <div className="text-xs font-bold uppercase tracking-wide" style={{ color: TEAL }}>Best for</div>
              <p className="text-sm text-blue-200 mt-1">Commercial tenders, MSP proposals, formal bids, new client pitches</p>
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================
           8. COMPANY DEFAULTS  (slate bg)
         ============================================================ */}
      <section id="company" className="py-16 md:py-24" style={{ background: "#f1f5f9" }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <Tag>Feature 8</Tag>
              <div className="pub-accent-bar mt-3" />
              <h2 className="text-3xl sm:text-4xl font-black mb-4" style={{ color: NAVY }}>
                Company Defaults — Set Once, Used Everywhere
              </h2>
              <p className="text-gray-600 leading-relaxed mb-5">
                Store your company facts once — working hours, insurance limits, quote validity period, payment terms, signatory name, and surface treatment details — and every quote uses them automatically. No more hunting through last month's quote to copy-paste your standard terms.
              </p>
              <div className="grid grid-cols-2 gap-3">
                {[
                  ["Working Hours", "Mon–Fri 8am–6pm, Sat 9am–1pm"],
                  ["Insurance Limits", "£5M public liability"],
                  ["Validity Period", "30 days from issue date"],
                  ["Payment Terms", "Net 30, 2% late interest"],
                  ["Signatory", "Director / authorised signatory"],
                  ["Surface Treatment", "Sector-specific defaults"],
                ].map(([title, sub]) => (
                  <div key={title} className="bg-white rounded-xl p-4 text-sm border border-gray-100">
                    <div className="font-semibold mb-1" style={{ color: NAVY }}>{title}</div>
                    <div className="text-gray-400 text-xs">{sub}</div>
                  </div>
                ))}
              </div>
            </div>

            <div
              className="rounded-2xl p-8"
              style={{ background: "rgba(13,148,136,0.10)", border: "1px solid rgba(13,148,136,0.20)" }}
            >
              <div className="font-bold text-sm mb-3 uppercase tracking-wide" style={{ color: TEAL }}>
                Why this matters
              </div>
              <p className="text-gray-600 leading-relaxed mb-4">
                Every quote that leaves without your VAT clause, insurance limits, or validity period is a liability. With company defaults set once, those details are baked into every draft automatically — no more forgetting, no more revisions.
              </p>
              <p className="text-gray-600 leading-relaxed">
                For teams, these defaults are shared across all users. Everyone quotes consistently, using the same terms, the same rates, the same wording.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================
           9. SECTOR SHOWCASE (full-width navy)
         ============================================================ */}
      <section id="sectors" className="py-16 md:py-24 text-white relative overflow-hidden" style={{ background: NAVY }}>
        <div
          className="absolute inset-0 opacity-5 pointer-events-none"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 50%, rgba(13,148,136,0.4) 0%, transparent 50%), radial-gradient(circle at 80% 20%, rgba(13,148,136,0.2) 0%, transparent 40%)",
          }}
        />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <div className="pub-accent-bar mx-auto" />
            <h2 className="text-3xl sm:text-4xl font-black">Built for your sector</h2>
            <p className="mt-4 text-blue-200">
              IdoYourQuotes knows how your industry quotes. Here's what a finished proposal looks like for each sector.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            <SectorCard
              id="it"
              emoji="🖥️"
              title="IT Services & MSPs"
              kw="MSP quoting software · IT proposal generator"
              body="26-user IT support proposal with managed services, Microsoft 365, hosting, and migration appendix — produced from a tender pack PDF and a 2-minute voice note. Output: 8-page branded proposal, ready to send."
              checks={[
                "Migration appendix auto-generated",
                "M365, Google Workspace, server migration support",
                "Tender pack PDF → structured proposal in minutes",
              ]}
            />
            <SectorCard
              id="cleaning"
              emoji="🧹"
              title="Commercial Cleaning"
              kw="Commercial cleaning quote software"
              body="Tender response for office cleaning produced from the tender brief alone, with your catalogue providing every line item rate. No re-typing, no manual pricing lookups, no guesswork."
              checks={[
                "Catalogue rates applied automatically",
                "Tender brief → complete proposal",
                "Frequency schedules and scope of works included",
              ]}
            />
            <SectorCard
              id="marketing"
              emoji="💻"
              title="Website & Digital Marketing"
              kw="Website design proposal template"
              body="Turn a client brief email into a polished website design proposal with scope, deliverables, timeline, and pricing. Agencies use IdoYourQuotes to respond to new business enquiries the same day they arrive."
              checks={[
                "Email brief → full proposal with deliverables",
                "Project timeline and payment schedule included",
                "Branded with your agency's logo and colours",
              ]}
            />
            <SectorCard
              id="pest"
              emoji="🐛"
              title="Pest Control"
              kw="Pest control quoting software"
              body="Annual service contract quoted from a phone call — voice dictation captures the scope, the system writes the proposal complete with treatment schedule, bait station locations, and exclusions."
              checks={[
                "Voice note → full contract proposal",
                "Treatment schedule and visit frequency included",
                "Exclusions and out-of-scope items auto-drafted",
              ]}
            />
          </div>
        </div>
      </section>

      {/* ============================================================
           FINAL CTA
         ============================================================ */}
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
          <h2 className="text-3xl sm:text-4xl font-black mb-5">
            See every feature in action — free for 14 days
          </h2>
          <p className="text-blue-100 text-lg mb-8 max-w-xl mx-auto">
            No credit card required. Full access to all features from day one. Cancel anytime.
          </p>
          <button
            onClick={handleGetStarted}
            className="inline-flex items-center gap-2 text-white font-bold rounded-xl text-lg shadow-xl hover:opacity-90 transition-all pub-btn-pulse"
            style={{ background: TEAL, padding: "16px 32px" }}
          >
            Start Your Free 14-Day Trial
            <ArrowRight className="h-5 w-5" />
          </button>
          <p className="mt-4 text-blue-300 text-sm">
            Already have an account?{" "}
            <Link href="/login" className="hover:underline" style={{ color: TEAL }}>
              Sign in
            </Link>
          </p>
        </div>
      </section>

      {/* ============================================================
           FOOTER
         ============================================================ */}
      <footer className="bg-gray-900 text-gray-400 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8 mb-10">
            <div>
              <img
                src="https://files.manuscdn.com/user_upload_by_module/session_file/310519663048135071/uMprjfIbjwvxZRuj.png"
                alt="IdoYourQuotes logo"
                className="h-8 w-auto object-contain mb-4 brightness-0 invert opacity-80"
              />
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
            © 2026 IdoYourQuotes. All rights reserved.
          </div>
        </div>
      </footer>

    </div>
  );
}

/* ─── sector card subcomponent ─── */

function SectorCard({
  id,
  emoji,
  title,
  kw,
  body,
  checks,
}: {
  id: string;
  emoji: string;
  title: string;
  kw: string;
  body: string;
  checks: string[];
}) {
  return (
    <div
      id={id}
      className="rounded-2xl p-8 pub-card-lift"
      style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)" }}
    >
      <div className="flex items-start gap-4 mb-5">
        <div className="text-4xl" aria-hidden="true">{emoji}</div>
        <div>
          <h3 className="font-bold text-white text-lg">{title}</h3>
          <p className="text-blue-300 text-sm">{kw}</p>
        </div>
      </div>
      <p className="text-blue-100 text-sm leading-relaxed mb-5">{body}</p>
      <div className="space-y-2 text-xs text-blue-200">
        {checks.map((c) => (
          <div key={c} className="flex items-center gap-2">
            <span style={{ color: TEAL }}>✓</span> {c}
          </div>
        ))}
      </div>
    </div>
  );
}
