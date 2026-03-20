import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getLoginUrl } from "@/const";
import {
  FileText,
  Upload,
  Brain,
  Calculator,
  Send,
  CheckCircle2,
  Shield,
  Clock,
  ArrowRight,
  Mic,
  FileImage,
  Mail,
  Zap,
  FolderOpen,
  ChevronRight,
  Timer,
} from "lucide-react";
import { useLocation } from "wouter";

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
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container flex h-16 md:h-36 items-center justify-between gap-2">
          <div className="flex items-center gap-2 shrink-0">
            <img
              src="https://files.manuscdn.com/user_upload_by_module/session_file/310519663048135071/uMprjfIbjwvxZRuj.png"
              alt="IdoYourQuotes"
              className="h-10 md:h-32 object-contain"
            />
          </div>
          <div className="flex items-center gap-2 md:gap-4 shrink-0">
            <Button variant="ghost" className="hidden sm:inline-flex" onClick={() => setLocation("/pricing")}>
              Pricing
            </Button>
            {loading ? null : user ? (
              <Button onClick={() => setLocation("/dashboard")}>
                Go to Dashboard
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            ) : (
              <>
                <Button variant="ghost" onClick={() => setLocation("/login")}>
                  Sign In
                </Button>
                <Button onClick={handleGetStarted}>
                  Get Started
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="py-20 md:py-32">
        <div className="container">
          <div className="max-w-4xl mx-auto text-center">
            <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight mb-6">
              Turn calls, tenders and site notes into professional quotes in minutes.
            </h1>
            <p className="text-xl md:text-2xl text-muted-foreground mb-8 max-w-2xl mx-auto">
              AI reads your inputs and builds the quote. You review, adjust, and approve before anything goes out.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button size="lg" className="text-lg px-8 py-6" onClick={handleGetStarted}>
                Start Your Free 14-Day Trial
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="text-lg px-8 py-6"
                onClick={() => setLocation("/pricing")}
              >
                View Pricing
              </Button>
            </div>
            <p className="text-sm text-muted-foreground mt-4">
              No credit card required. Only pay after 14 days if you're happy — we know you'll love it.
            </p>
          </div>
        </div>
      </section>

      {/* Trust Bar — before video to prime the viewer */}
      <section className="py-8 bg-muted/50 border-y">
        <div className="container">
          <div className="flex flex-wrap justify-center gap-8 md:gap-16 text-muted-foreground">
            <div className="flex items-center gap-2">
              <Timer className="h-5 w-5 text-primary" />
              <span className="font-medium">Most quotes drafted in under 5 minutes</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-primary" />
              <span className="font-medium">You approve everything before it goes out</span>
            </div>
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              <span className="font-medium">Your data stays private</span>
            </div>
          </div>
        </div>
      </section>

      {/* Video Demo Section */}
      <section id="demo-video" className="py-16 md:py-20 bg-muted/30">
        <div className="container">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-10">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">
                See IdoYourQuotes in Action
              </h2>
              <p className="text-lg text-muted-foreground">
                Watch how easy it is to turn a tender into a professional quote
              </p>
            </div>
            <div className="relative aspect-video rounded-2xl overflow-hidden shadow-2xl border-4 border-card">
              <iframe
                className="absolute inset-0 w-full h-full"
                src="https://www.youtube.com/embed/4Ssays6_iDs?rel=0&modestbranding=1"
                title="IdoYourQuotes Demo"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          </div>
        </div>
      </section>

      {/* Benefits Section — replaces the generic blockquote */}
      <section className="py-20 md:py-28">
        <div className="container">
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Less admin. More winning jobs.
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Built for trades, contractors, and service businesses who spend too much time writing quotes.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {[
              {
                icon: Zap,
                colour: "#0d9488",
                bg: "#f0fdfa",
                heading: "Quotes drafted in minutes",
                body: "Most jobs are ready to review in under 5 minutes. Upload your inputs, let AI do the heavy lifting, then refine and send.",
              },
              {
                icon: FolderOpen,
                colour: "#1a2b4a",
                bg: "#f1f5f9",
                heading: "All your evidence in one place",
                body: "Voice notes, PDFs, drawings, emails — everything feeds into one structured draft. Nothing gets missed, nothing gets lost.",
              },
              {
                icon: CheckCircle2,
                colour: "#059669",
                bg: "#f0fdf4",
                heading: "Nothing leaves without your say-so",
                body: "Every quote is reviewed and approved by you. The AI drafts, you decide. No surprises, no accidental sends.",
              },
            ].map((item) => (
              <div
                key={item.heading}
                className="rounded-2xl border-2 p-8 hover:shadow-lg transition-shadow"
                style={{ borderColor: "#e8ecf1" }}
              >
                <div
                  className="h-12 w-12 rounded-xl flex items-center justify-center mb-5"
                  style={{ backgroundColor: item.bg }}
                >
                  <item.icon className="h-6 w-6" style={{ color: item.colour }} />
                </div>
                <h3 className="text-xl font-bold mb-3" style={{ color: "#1a2b4a" }}>
                  {item.heading}
                </h3>
                <p className="text-muted-foreground leading-relaxed">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works — redesigned with flow */}
      <section className="py-20 md:py-28 bg-muted/30">
        <div className="container">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              From raw inputs to professional quote
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Four steps. No blank pages. No hours lost.
            </p>
          </div>

          <div className="max-w-5xl mx-auto">
            <div className="grid md:grid-cols-4 gap-0">
              {[
                {
                  step: "01",
                  icon: Upload,
                  title: "Upload your inputs",
                  description: "Drop in PDFs, drawings, voice notes, emails, or paste text. Everything in one place.",
                },
                {
                  step: "02",
                  icon: Brain,
                  title: "AI builds a draft",
                  description: "The AI reads everything, extracts scope, quantities, and pricing, and structures a complete quote draft.",
                },
                {
                  step: "03",
                  icon: Calculator,
                  title: "You review and edit",
                  description: "Check every line item, adjust prices, add your margin, and refine the wording. Full control.",
                },
                {
                  step: "04",
                  icon: Send,
                  title: "Send the quote",
                  description: "Generate a clean, professional PDF. Only what your client needs to see — nothing internal leaks out.",
                },
              ].map((item, idx) => (
                <div key={item.step} className="relative flex flex-col items-center text-center px-4">
                  {/* Connector line between steps */}
                  {idx < 3 && (
                    <div
                      className="hidden md:block absolute top-8 left-1/2 w-full h-0.5 z-0"
                      style={{ backgroundColor: "#e8ecf1", left: "50%", width: "100%" }}
                    />
                  )}
                  {/* Step circle */}
                  <div
                    className="relative z-10 h-16 w-16 rounded-2xl flex items-center justify-center mb-5 shadow-sm"
                    style={{ backgroundColor: "#1a2b4a" }}
                  >
                    <item.icon className="h-7 w-7 text-white" />
                  </div>
                  <div
                    className="text-xs font-bold mb-1 tracking-widest uppercase"
                    style={{ color: "#0d9488" }}
                  >
                    Step {item.step}
                  </div>
                  <h3 className="text-base font-bold mb-2" style={{ color: "#1a2b4a" }}>
                    {item.title}
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {item.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Input Types — upgraded with benefit lines */}
      <section className="py-20 md:py-28">
        <div className="container">
          <div className="grid md:grid-cols-2 gap-12 items-center max-w-5xl mx-auto">
            <div>
              <h2 className="text-3xl md:text-4xl font-bold mb-4" style={{ color: "#1a2b4a" }}>
                Works with everything you already have
              </h2>
              <p className="text-lg text-muted-foreground mb-8">
                No need to re-type or reformat anything. Drop in whatever you've got and the AI figures out the rest.
              </p>
              <div className="space-y-3">
                {[
                  {
                    icon: FileText,
                    label: "PDF Tenders & Specifications",
                    detail: "AI reads and extracts scope, quantities, and requirements",
                  },
                  {
                    icon: FileImage,
                    label: "Drawings & Site Plans",
                    detail: "Upload images — dimensions and layouts are captured automatically",
                  },
                  {
                    icon: Mic,
                    label: "Voice Notes & Call Recordings",
                    detail: "Dictate on-site or record a client call — transcribed and structured instantly",
                  },
                  {
                    icon: Mail,
                    label: "Emails & Pasted Text",
                    detail: "Paste any email thread or brief — client details and scope extracted automatically",
                  },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="flex items-start gap-4 p-4 rounded-xl border bg-card hover:shadow-sm transition-shadow"
                  >
                    <div
                      className="h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                      style={{ backgroundColor: "#f0fdfa" }}
                    >
                      <item.icon className="h-4 w-4" style={{ color: "#0d9488" }} />
                    </div>
                    <div>
                      <p className="font-semibold text-sm" style={{ color: "#1a2b4a" }}>
                        {item.label}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">{item.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Mock upload widget */}
            <div
              className="rounded-2xl border-2 p-8 shadow-lg"
              style={{ borderColor: "#e8ecf1", backgroundColor: "#fafbfc" }}
            >
              <p className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: "#4a5e80" }}>
                Added Inputs
              </p>
              <div className="space-y-3">
                {[
                  { icon: FileText, name: "tender_specification.pdf", status: "Analysed", statusColor: "#0d9488", bg: "#fef2f2", iconColor: "#ef4444" },
                  { icon: FileImage, name: "site_drawing_v2.jpg", status: "Analysed", statusColor: "#0d9488", bg: "#eff6ff", iconColor: "#3b82f6" },
                  { icon: Mic, name: "client_call_notes.m4a", status: "Analysed", statusColor: "#0d9488", bg: "#f0fdfa", iconColor: "#0d9488" },
                ].map((f) => (
                  <div
                    key={f.name}
                    className="h-12 rounded-lg flex items-center px-4 gap-3 border"
                    style={{ backgroundColor: f.bg, borderColor: "#e8ecf1" }}
                  >
                    <f.icon className="h-4 w-4 flex-shrink-0" style={{ color: f.iconColor }} />
                    <span className="text-xs text-muted-foreground flex-1 truncate">{f.name}</span>
                    <span className="text-[10px] font-bold" style={{ color: f.statusColor }}>
                      ✓ {f.status}
                    </span>
                  </div>
                ))}
                <div
                  className="h-12 rounded-lg flex items-center px-4 gap-3 border-2 border-dashed cursor-pointer hover:bg-teal-50 transition-colors"
                  style={{ borderColor: "#0d9488", backgroundColor: "#f0fdfa" }}
                >
                  <Upload className="h-4 w-4" style={{ color: "#0d9488" }} />
                  <span className="text-xs font-medium" style={{ color: "#0d9488" }}>
                    Drop files here or click to upload
                  </span>
                </div>
              </div>

              {/* AI building the draft */}
              <div
                className="mt-6 rounded-xl p-4 border"
                style={{ backgroundColor: "#1a2b4a", borderColor: "#2a3f63" }}
              >
                <div className="flex items-center gap-2 mb-3">
                  <Brain className="h-4 w-4 text-teal-400" />
                  <span className="text-xs font-bold text-white">Quote Draft Summary</span>
                  <span
                    className="text-[10px] font-bold ml-auto px-2 py-0.5 rounded-full"
                    style={{ backgroundColor: "#0d9488", color: "#fff" }}
                  >
                    Ready to review
                  </span>
                </div>
                <div className="space-y-1.5">
                  {["7 × Emergency Exit Signs", "90 × Linear LED Lights", "38 × LED Emergency Fittings", "186 × Surface LED Lights"].map((line) => (
                    <div key={line} className="flex items-center gap-2">
                      <CheckCircle2 className="h-3 w-3 text-teal-400 flex-shrink-0" />
                      <span className="text-xs text-white/70">{line}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 md:py-28 bg-primary text-primary-foreground">
        <div className="container">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-3xl md:text-4xl font-bold mb-6">
              Ready to get your evenings back?
            </h2>
            <p className="text-xl opacity-90 mb-8">
              Join trades, contractors, and consultants who use IdoYourQuotes to win more work with less admin.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button
                size="lg"
                variant="secondary"
                className="text-lg px-8 py-6"
                onClick={handleGetStarted}
              >
                Start Your Free 14-Day Trial
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
              <Button
                size="lg"
                variant="ghost"
                className="text-lg px-8 py-6 text-primary-foreground/80 hover:text-primary-foreground"
                onClick={() => setLocation("/pricing")}
              >
                View Pricing
              </Button>
            </div>
            <p className="text-sm opacity-70 mt-4">No credit card required · Cancel anytime</p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 border-t bg-card">
        <div className="container">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex items-center gap-2">
              <img
                src="https://files.manuscdn.com/user_upload_by_module/session_file/310519663048135071/uMprjfIbjwvxZRuj.png"
                alt="IdoYourQuotes"
                className="h-10 object-contain"
              />
            </div>
            <p className="text-sm text-muted-foreground">
              © {new Date().getFullYear()} IdoYourQuotes. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
