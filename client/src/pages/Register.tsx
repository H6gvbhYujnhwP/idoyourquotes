import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Loader2,
  AlertCircle,
  CheckCircle2,
  Crown,
  CreditCard,
  Shield,
  Clock,
  ArrowLeft,
  ArrowRight,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { VISIBLE_TRADE_SECTOR_OPTIONS } from "@/lib/tradeSectors";

const TEAL = "#0d9488";
const NAVY = "#1a2b4a";

const INCLUDED_FEATURES = [
  "Voice dictation",
  "Drag-and-drop evidence (PDF, email, audio)",
  "Branded proposal templates",
  "Product catalogue",
  "Smart defaults",
];

export default function Register() {
  const [name, setName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [tradeSector, setTradeSector] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const passwordRequirements = [
    { met: password.length >= 8, text: "At least 8 characters" },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!companyName.trim()) {
      setError("Company/Organization name is required");
      return;
    }

    if (!tradeSector) {
      setError("Please select your business sector");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          name,
          companyName: companyName.trim(),
          defaultTradeSector: tradeSector,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Registration failed");
        setLoading(false);
        return;
      }

      // Redirect to dashboard on success
      window.location.href = "/dashboard";
    } catch (err) {
      setError("An error occurred. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-white font-sans">
      {/* Header */}
      <header className="sticky top-0 z-50 pub-sticky-nav">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between" style={{ height: 100 }}>
          <Link href="/" aria-label="IdoYourQuotes home" className="inline-block flex-shrink-0" style={{ height: 65 }}>
            <img
              src="https://files.manuscdn.com/user_upload_by_module/session_file/310519663048135071/uMprjfIbjwvxZRuj.png"
              alt="IdoYourQuotes"
              style={{ height: 65, width: "auto", objectFit: "contain" }}
            />
          </Link>

          <nav className="hidden md:flex items-center" style={{ gap: 10 }} aria-label="Main navigation">
            <Link
              href="/pricing"
              className="text-[18px] font-medium text-[#464646] px-4 py-[18px] rounded-[9px] border border-transparent hover:border-[#464646] transition-colors no-underline whitespace-nowrap"
            >
              Pricing
            </Link>
            <Link
              href="/login"
              className="text-[18px] font-medium text-[#464646] px-4 py-[18px] rounded-[9px] border border-transparent hover:border-[#464646] transition-colors no-underline whitespace-nowrap"
            >
              Sign In
            </Link>
          </nav>
        </div>
      </header>

      {/* Split panel */}
      <main className="flex-1 flex">

        {/* Left decorative panel — DARK text on LIGHT bg (fixes invisible-text bug) */}
        <div className="hidden lg:flex lg:w-5/12 pub-auth-left pub-auth-left-grid flex-col justify-between p-12">
          <div className="pub-anim-fade-up">
            <div className="w-12 h-1 rounded mb-8" style={{ background: TEAL }} />
            <h2 className="text-3xl font-black leading-tight mb-4" style={{ color: NAVY }}>
              Your first quote<br />in under 5 minutes.
            </h2>
            <p className="text-slate-600 text-base leading-relaxed max-w-sm">
              Full access to every feature from day one. No credit card. No commitment. Just start quoting.
            </p>
          </div>

          {/* "What's included" card */}
          <div className="space-y-5 pub-anim-fade-up pub-delay-200">
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
              <div className="font-bold text-sm mb-3 uppercase tracking-wide" style={{ color: TEAL }}>
                What's included
              </div>
              <div className="space-y-2.5 text-sm text-slate-700">
                {INCLUDED_FEATURES.map((feature, i) => (
                  <div key={i} className="flex items-center gap-2.5">
                    <CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: TEAL }} />
                    {feature}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-4 text-sm text-slate-600">
              <div className="flex items-center gap-1.5">
                <CreditCard className="h-3.5 w-3.5" style={{ color: TEAL }} />
                No card needed
              </div>
              <div className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" style={{ color: TEAL }} />
                Cancel anytime
              </div>
            </div>
          </div>

          <p className="text-slate-400 text-xs">© 2026 IdoYourQuotes. All rights reserved.</p>
        </div>

        {/* Right form panel */}
        <div className="flex-1 flex items-start justify-center p-6 sm:p-10 lg:p-12 overflow-y-auto">
          <div className="w-full max-w-lg pub-anim-fade-up">

            {/* Trial badge */}
            <div className="rounded-2xl p-5 mb-6 flex items-center gap-4" style={{ background: "rgba(13,148,136,0.10)", border: "1px solid rgba(13,148,136,0.25)" }}>
              <Crown className="h-7 w-7 shrink-0" style={{ color: TEAL }} />
              <div>
                <div className="font-bold text-base" style={{ color: NAVY }}>14-Day Free Trial</div>
                <div className="text-xs text-slate-600">Full access to all features. No credit card required.</div>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-8 sm:p-10">

              <div className="mb-8">
                <h1 className="text-2xl font-black mb-1" style={{ color: NAVY }}>Start your free trial</h1>
                <p className="text-slate-500 text-sm">
                  Create professional quotes in minutes — we know you'll love it
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                <div className="space-y-1.5">
                  <Label htmlFor="name" className="text-sm font-semibold" style={{ color: NAVY }}>Full Name</Label>
                  <Input
                    id="name"
                    type="text"
                    placeholder="John Smith"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoComplete="name"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="companyName" className="text-sm font-semibold" style={{ color: NAVY }}>
                    Company / Organisation Name <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="companyName"
                    type="text"
                    placeholder="Acme Construction Ltd"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    required
                    autoComplete="organization"
                  />
                  <p className="text-xs text-slate-500">
                    This will be used as your organisation name for team collaboration
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="tradeSector" className="text-sm font-semibold" style={{ color: NAVY }}>
                    Your Business Sector <span className="text-red-500">*</span>
                  </Label>
                  <Select value={tradeSector} onValueChange={setTradeSector}>
                    <SelectTrigger id="tradeSector">
                      <SelectValue placeholder="Select your primary business sector..." />
                    </SelectTrigger>
                    <SelectContent className="max-h-[300px]">
                      {VISIBLE_TRADE_SECTOR_OPTIONS.map((sector) => (
                        <SelectItem key={sector.value} value={sector.value}>
                          {sector.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="email" className="text-sm font-semibold" style={{ color: NAVY }}>
                    Email <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="password" className="text-sm font-semibold" style={{ color: NAVY }}>
                    Password <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="new-password"
                  />
                  <div className="space-y-1">
                    {passwordRequirements.map((req, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        {req.met ? (
                          <CheckCircle2 className="w-3 h-3 text-green-600" />
                        ) : (
                          <div className="w-3 h-3 rounded-full border border-slate-400" />
                        )}
                        <span className={req.met ? "text-green-600" : "text-slate-500"}>
                          {req.text}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="confirmPassword" className="text-sm font-semibold" style={{ color: NAVY }}>
                    Confirm Password <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    autoComplete="new-password"
                  />
                </div>

                <Button
                  type="submit"
                  className="w-full font-bold text-sm shadow-md pub-btn-pulse"
                  style={{ background: TEAL, color: "white", padding: "14px", borderRadius: 12 }}
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating account...
                    </>
                  ) : (
                    <>
                      Start My Free Trial
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </>
                  )}
                </Button>

                <p className="text-xs text-center text-slate-500 flex items-center justify-center gap-1.5">
                  <Shield className="h-3 w-3" />
                  Your 14-day trial starts immediately. Only enter card details after 14 days if you're happy.
                </p>
              </form>

              <p className="mt-6 text-center text-sm text-slate-500">
                Already have an account?{" "}
                <Link href="/login" className="font-semibold hover:underline" style={{ color: TEAL }}>
                  Sign in
                </Link>
              </p>
            </div>

            <div className="text-center mt-6">
              <Link
                href="/"
                className="text-sm text-slate-500 hover:text-[#0d9488] transition-colors inline-flex items-center justify-center gap-1.5"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back to home
              </Link>
            </div>
          </div>
        </div>

      </main>
    </div>
  );
}
