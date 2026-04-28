import { useAuth } from "@/_core/hooks/useAuth";
import { Link, useLocation } from "wouter";
import PublicHeader from "@/components/PublicHeader";
import {
  ArrowRight,
  ArrowLeft,
  Mic,
  Paperclip,
  Layout,
  List,
  Server,
  Settings,
  CheckCircle2,
  Clock,
  Zap,
  FileX,
  UploadCloud,
  Cpu,
  Send,
} from "lucide-react";

const TEAL = "#0d9488";
const NAVY = "#1a2b4a";

export default function Home() {
  const { user, loading } = useAuth();
  const [, setLocation] = useLocation();

  const handleGetStarted = () => {
    if (user) {
      setLocation("/dashboard");
    } else {
      setLocation("/register");
    }
  };

  return (
    <div className="min-h-screen bg-white text-gray-900 font-sans antialiased">

      {/* ============================================================
           PERSISTENT HEADER
         ============================================================ */}
      <PublicHeader currentPage="home" />

      {/* ============================================================
           HERO BAND
         ============================================================ */}
      <section className="pub-hero-band text-white overflow-hidden relative">
        <div
          className="absolute inset-0 opacity-5 pointer-events-none"
          style={{
            backgroundImage:
              "repeating-linear-gradient(0deg,transparent,transparent 39px,rgba(255,255,255,0.3) 39px,rgba(255,255,255,0.3) 40px), repeating-linear-gradient(90deg,transparent,transparent 39px,rgba(255,255,255,0.3) 39px,rgba(255,255,255,0.3) 40px)",
          }}
        />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 md:py-28 relative z-10">
          <div className="max-w-3xl">
            <div className="pub-accent-bar pub-anim-fade-in" />
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-black leading-tight tracking-tight pub-anim-fade-up">
              Stop spending half a day<br className="hidden sm:block" />
              writing a single quote.
            </h1>
            <p className="mt-6 text-lg sm:text-xl text-blue-100 max-w-2xl pub-anim-fade-up pub-delay-200">
              IdoYourQuotes is the AI quote generator that turns a call, a tender PDF, or a voice note into a complete, branded proposal in under 5&nbsp;minutes — not 4&nbsp;hours.
            </p>

            <div className="mt-6 flex flex-wrap gap-4 text-sm text-blue-200 pub-anim-fade-up pub-delay-300">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4" style={{ color: TEAL }} />
                Most quotes ready in under 5 minutes
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4" style={{ color: TEAL }} />
                You approve everything before it goes out
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4" style={{ color: TEAL }} />
                No credit card required for 14-day trial
              </span>
            </div>

            <div className="mt-8 flex flex-wrap gap-4 pub-anim-fade-up pub-delay-400">
              <button
                onClick={handleGetStarted}
                className="inline-flex items-center gap-2 text-white font-bold rounded-xl text-base shadow-lg hover:opacity-90 transition-all"
                style={{ background: TEAL, padding: "14px 28px" }}
              >
                Start Your Free 14-Day Trial
                <ArrowRight className="h-[18px] w-[18px]" />
              </button>
              <button
                onClick={() => setLocation("/pricing")}
                className="inline-flex items-center gap-2 border border-white/30 text-white font-semibold rounded-xl text-base hover:bg-white/10 transition-all"
                style={{ padding: "14px 28px" }}
              >
                View Pricing
              </button>
            </div>
          </div>
        </div>

        <div className="absolute bottom-0 left-0 right-0 h-2 opacity-60" style={{ background: TEAL }} />
      </section>

      {/* ============================================================
           VIDEO — EXISTING YouTube URL preserved exactly
         ============================================================ */}
      <section id="demo-video" className="py-16 md:py-20" style={{ background: "#f1f5f9" }}>
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="pub-accent-bar mx-auto" />
          <h2 className="text-2xl sm:text-3xl font-bold mb-3" style={{ color: NAVY }}>
            See IdoYourQuotes in Action
          </h2>
          <p className="text-gray-500 mb-8">
            Watch how easy it is to turn a tender into a professional quote
          </p>
          <div className="relative aspect-video rounded-2xl overflow-hidden shadow-2xl border-4 border-white" style={{ background: NAVY }}>
            <iframe
              className="absolute inset-0 w-full h-full"
              src="https://www.youtube.com/embed/4Ssays6_iDs?rel=0&modestbranding=1"
              title="IdoYourQuotes Demo"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        </div>
      </section>

      {/* ============================================================
           THREE PAINS
         ============================================================ */}
      <section className="py-16 md:py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl mb-12">
            <div className="pub-accent-bar" />
            <h2 className="text-3xl sm:text-4xl font-black pub-slash-divider" style={{ color: NAVY }}>
              The three things killing your evenings
            </h2>
            <p className="mt-4 text-gray-500 text-lg">
              Sound familiar? You're not alone. Every tradesperson and SME owner faces the same grind.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            <PainCard
              icon={<Clock className="h-[26px] w-[26px]" style={{ color: TEAL }} />}
              title="2–8 hours per quote"
              body="Hand-typing scope, terms, pricing tables, and cover pages from scratch — every single time. That's a full working day lost each week."
              tagline="IdoYourQuotes: under 5 minutes"
            />
            <PainCard
              icon={<Zap className="h-[26px] w-[26px]" style={{ color: TEAL }} />}
              title="Losing jobs to faster competitors"
              body="The client picks whoever responds first. If you're still drafting on Thursday what you surveyed on Monday, you've already lost."
              tagline="IdoYourQuotes: respond same day"
            />
            <PainCard
              icon={<FileX className="h-[26px] w-[26px]" style={{ color: TEAL }} />}
              title="Word docs that look amateurish"
              body="No design skills, no time, no template. You send a plain Word file and the bigger competitor sends a polished 8-page branded proposal."
              tagline="IdoYourQuotes: branded proposals every time"
            />
          </div>
        </div>
      </section>

      {/* ============================================================
           HOW IT WORKS — 3 steps
         ============================================================ */}
      <section className="py-16 md:py-24 overflow-hidden" style={{ background: "#f1f5f9" }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <div className="pub-accent-bar mx-auto" />
            <h2 className="text-3xl sm:text-4xl font-black" style={{ color: NAVY }}>
              From raw inputs to professional proposal
            </h2>
            <p className="mt-4 text-gray-500 text-lg">
              Three steps. No blank pages. No hours lost.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 relative">
            <div className="hidden md:block absolute top-10 left-1/3 right-1/3 h-0.5 opacity-30 z-0" style={{ background: TEAL }} />

            <StepCard
              number="01"
              icon={<UploadCloud className="h-[26px] w-[26px]" style={{ color: TEAL }} />}
              title="Drop in your evidence"
              body="PDFs, tender packs, voice notes, email threads, site photos, Word docs — drop them all in. Everything in one place, nothing re-typed."
            />
            <StepCard
              number="02"
              icon={<Cpu className="h-[26px] w-[26px]" style={{ color: TEAL }} />}
              title="The system drafts the proposal"
              body="Scope, quantities, line items from your catalogue, pricing tables, executive summary, terms, and signature block — structured and written automatically."
            />
            <StepCard
              number="03"
              icon={<Send className="h-[26px] w-[26px]" style={{ color: TEAL }} />}
              title="Review, approve, and send"
              body="Check every line, adjust margins, refine wording. You're in full control. When you're happy, generate a clean branded PDF and send it."
            />
          </div>
        </div>
      </section>

      {/* ============================================================
           FEATURE HIGHLIGHTS
         ============================================================ */}
      <section className="py-16 md:py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <div className="pub-accent-bar mx-auto" />
            <h2 className="text-3xl sm:text-4xl font-black" style={{ color: NAVY }}>
              What makes IdoYourQuotes genuinely different
            </h2>
            <p className="mt-4 text-gray-500">
              Not another form-filler. Every feature is built around how tradespeople and SMEs actually work.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            <FeatureCard icon={<Mic className="h-[26px] w-[26px]" style={{ color: TEAL }} />} title="Voice Dictation" body="Walk back from a site visit, talk into your phone. The transcript becomes the quote draft." />
            <FeatureCard icon={<Paperclip className="h-[26px] w-[26px]" style={{ color: TEAL }} />} title="Drag-and-Drop Evidence" body="PDFs, photos, .eml/.msg email threads, Word docs, audio recordings — drop them in and the system reads them all." />
            <FeatureCard icon={<Layout className="h-[26px] w-[26px]" style={{ color: TEAL }} />} title="Branded Proposals" body="Cover page, executive summary, scope, pricing tables, terms, signature block. Logo and brand colours pulled from your website automatically." />
            <FeatureCard icon={<List className="h-[26px] w-[26px]" style={{ color: TEAL }} />} title="Catalogue-Backed Line Items" body="Your own products and services feed straight into the draft. Prices and descriptions match what you actually sell." />
            <FeatureCard icon={<Server className="h-[26px] w-[26px]" style={{ color: TEAL }} />} title="IT Migration Appendix" body="MSP-specific: auto-generates a six-section appendix for server, M365, Google Workspace, and tenant-merge migrations." />
            <FeatureCard icon={<Settings className="h-[26px] w-[26px]" style={{ color: TEAL }} />} title="Smart Defaults That Learn" body='Edit a section once, tick "save as default", and every future quote pre-fills with that wording. No more retyping boilerplate.' />
          </div>
        </div>
      </section>

      {/* ============================================================
           SECTOR CALLOUTS
         ============================================================ */}
      <section className="py-16 md:py-24 overflow-hidden relative" style={{ background: NAVY }}>
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
            <h2 className="text-3xl sm:text-4xl font-black text-white">Built for your trade</h2>
            <p className="mt-4 text-blue-200">
              IdoYourQuotes knows how your sector quotes. Here's what a finished proposal looks like for each.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            <SectorCard emoji="🖥️" title="IT Services & MSPs" body="26-user IT support proposal with managed services, M365, hosting, and migration appendix — produced from a tender pack PDF and a 2-minute voice note. Output: 8-page branded proposal." />
            <SectorCard emoji="🧹" title="Commercial Cleaning" body="Tender response for office cleaning produced from the tender brief alone, with your catalogue providing every line item rate. No re-typing, no guesswork." />
            <SectorCard emoji="💻" title="Website & Digital Marketing" body="Turn a client brief email into a polished website design proposal with scope, deliverables, timeline, and pricing — in the time it takes to make a coffee." />
            <SectorCard emoji="🐛" title="Pest Control" body="Annual service contract quoted from a phone call — voice dictation captures the scope, the system writes the proposal with treatment schedule and exclusions." />
          </div>
        </div>
      </section>

      {/* ============================================================
           WHY IT WORKS — value props
         ============================================================ */}
      <section className="py-16 md:py-20" style={{ background: "#f1f5f9" }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <div className="pub-accent-bar mx-auto" />
            <h2 className="text-2xl sm:text-3xl font-black mb-3" style={{ color: NAVY }}>
              Why it works
            </h2>
            <p className="text-gray-500">
              The three things tradespeople and SMEs care about most when picking a quoting tool.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            <ValuePropCard
              icon={<Clock className="h-[26px] w-[26px]" style={{ color: TEAL }} />}
              title="Under 5 minutes"
              body="From voice note or tender PDF to a branded, signature-ready proposal."
            />
            <ValuePropCard
              icon={<List className="h-[26px] w-[26px]" style={{ color: TEAL }} />}
              title="Your catalogue, your rates"
              body="Every line item priced from products you've set up — no copy-paste, no pricing errors."
            />
            <ValuePropCard
              icon={<Layout className="h-[26px] w-[26px]" style={{ color: TEAL }} />}
              title="Quick PDF or full tender pack"
              body="Two output modes — fast quotes when you need speed, multi-page proposals when you need to win the work."
            />
          </div>
        </div>
      </section>

      {/* ============================================================
           PRICING TEASER
         ============================================================ */}
      <section className="py-16 md:py-20 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="pub-accent-bar mx-auto" />
          <h2 className="text-3xl sm:text-4xl font-black mb-4" style={{ color: NAVY }}>Simple, transparent pricing</h2>
          <p className="text-gray-500 text-lg mb-8">
            Start with a free 14-day trial. Plans from £59/month + VAT. No credit card required.
          </p>

          <div className="grid sm:grid-cols-3 gap-5 mb-8">
            <div className="rounded-2xl p-6 text-left border border-gray-100" style={{ background: "#f1f5f9" }}>
              <div className="text-sm font-bold uppercase tracking-wide mb-1" style={{ color: TEAL }}>Solo</div>
              <div className="text-3xl font-black" style={{ color: NAVY }}>
                £59<span className="text-base font-normal text-gray-400">/mo</span>
              </div>
              <p className="text-xs text-gray-400 mt-0.5">£70.80 inc VAT</p>
              <p className="text-sm text-gray-500 mt-3">1 user · 10 AI quotes/month</p>
            </div>
            <div className="rounded-2xl p-6 text-left relative overflow-hidden" style={{ background: NAVY }}>
              <div className="absolute top-3 right-3 text-white text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: TEAL }}>
                Popular
              </div>
              <div className="text-sm font-bold uppercase tracking-wide mb-1" style={{ color: TEAL }}>Pro</div>
              <div className="text-3xl font-black text-white">
                £99<span className="text-base font-normal text-blue-300">/mo</span>
              </div>
              <p className="text-xs text-blue-300 mt-0.5">£118.80 inc VAT</p>
              <p className="text-sm text-blue-200 mt-3">2 users · 15 AI quotes/month</p>
            </div>
            <div className="rounded-2xl p-6 text-left border border-gray-100" style={{ background: "#f1f5f9" }}>
              <div className="text-sm font-bold uppercase tracking-wide mb-1" style={{ color: TEAL }}>Team</div>
              <div className="text-3xl font-black" style={{ color: NAVY }}>
                £159<span className="text-base font-normal text-gray-400">/mo</span>
              </div>
              <p className="text-xs text-gray-400 mt-0.5">£190.80 inc VAT</p>
              <p className="text-sm text-gray-500 mt-3">5 users · 50 AI quotes/month</p>
            </div>
          </div>

          <button
            onClick={() => setLocation("/pricing")}
            className="inline-flex items-center gap-2 border-2 font-bold rounded-xl hover:text-white transition-all"
            style={{ borderColor: TEAL, color: TEAL, padding: "12px 32px" }}
            onMouseOver={(e) => { e.currentTarget.style.background = TEAL; e.currentTarget.style.color = "white"; }}
            onMouseOut={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = TEAL; }}
          >
            Compare all plans
            <ArrowRight className="h-4 w-4" />
          </button>
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
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-black mb-5">
            Ready to get your evenings back?
          </h2>
          <p className="text-blue-100 text-lg mb-8 max-w-xl mx-auto">
            Join trades, contractors, and consultants who use IdoYourQuotes to win more work with less admin. 14 days free, no card required.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <button
              onClick={handleGetStarted}
              className="inline-flex items-center gap-2 text-white font-bold rounded-xl text-lg shadow-xl hover:opacity-90 transition-all pub-btn-pulse"
              style={{ background: TEAL, padding: "16px 32px" }}
            >
              Start Your Free 14-Day Trial
              <ArrowRight className="h-5 w-5" />
            </button>
            <button
              onClick={() => setLocation("/pricing")}
              className="inline-flex items-center gap-2 border border-white/30 text-white font-semibold rounded-xl text-lg hover:bg-white/10 transition-all"
              style={{ padding: "16px 32px" }}
            >
              View Pricing
            </button>
          </div>
          <p className="mt-5 text-blue-300 text-sm">No credit card required · Cancel anytime</p>
        </div>
      </section>

      {/* ============================================================
           FOOTER
         ============================================================ */}
      <footer className="bg-gray-900 text-gray-400 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8 mb-10">
            <div>
              <div className="mb-4 text-2xl font-black text-white">
                IdoYour<span style={{ color: TEAL }}>Quotes</span>
              </div>
              <p className="text-sm leading-relaxed">
                AI-powered quoting and proposal platform for tradespeople and small businesses.
              </p>
            </div>
            <div>
              <h4 className="text-white font-semibold text-sm mb-3">Product</h4>
              <ul className="space-y-2 text-sm">
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

/* ─── card components (local; no shared file needed) ─── */

function PainCard({ icon, title, body, tagline }: { icon: React.ReactNode; title: string; body: string; tagline: string }) {
  return (
    <div className="pub-pain-card rounded-xl p-7 shadow-sm pub-card-lift">
      <div className="pub-icon-circle mb-5">{icon}</div>
      <h3 className="text-xl font-bold mb-2" style={{ color: NAVY }}>{title}</h3>
      <p className="text-gray-500 text-sm leading-relaxed">{body}</p>
      <div className="mt-4 text-xs font-bold uppercase tracking-wide" style={{ color: TEAL }}>{tagline}</div>
    </div>
  );
}

function StepCard({ number, icon, title, body }: { number: string; icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="relative bg-white rounded-2xl p-8 shadow-sm pub-card-lift z-10">
      <span className="pub-step-number">{number}</span>
      <div className="pub-icon-circle mb-5 relative z-10">{icon}</div>
      <h3 className="text-lg font-bold mb-2 relative z-10" style={{ color: NAVY }}>{title}</h3>
      <p className="text-gray-500 text-sm leading-relaxed relative z-10">{body}</p>
    </div>
  );
}

function FeatureCard({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="rounded-2xl p-7 pub-card-lift border border-transparent hover:border-[#0d9488] transition-all" style={{ background: "#f1f5f9" }}>
      <div className="pub-icon-circle mb-4">{icon}</div>
      <h3 className="font-bold mb-1" style={{ color: NAVY }}>{title}</h3>
      <p className="text-sm text-gray-500 leading-relaxed">{body}</p>
    </div>
  );
}

function ValuePropCard({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100 pub-card-lift">
      <div className="pub-icon-circle mb-5">{icon}</div>
      <h3 className="text-lg font-bold mb-2" style={{ color: NAVY }}>{title}</h3>
      <p className="text-sm text-gray-500 leading-relaxed">{body}</p>
    </div>
  );
}

function SectorCard({ emoji, title, body }: { emoji: string; title: string; body: string }) {
  return (
    <div className="pub-sector-card rounded-xl p-6 pub-card-lift">
      <div className="text-3xl mb-3" aria-hidden="true">{emoji}</div>
      <h3 className="font-bold text-white text-base mb-2">{title}</h3>
      <p className="text-blue-200 text-xs leading-relaxed">{body}</p>
    </div>
  );
}
