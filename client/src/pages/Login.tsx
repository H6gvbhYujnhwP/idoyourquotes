import { useState } from "react";
import { Link } from "wouter";
import PublicHeader from "@/components/PublicHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, AlertCircle, Mic, FileText, Clock, ArrowLeft } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Login failed");
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
      <PublicHeader currentPage="login" />

      {/* Split panel */}
      <main className="flex-1 flex">

        {/* Left decorative panel — DARK text on LIGHT bg (fixes invisible-text bug) */}
        <div className="hidden lg:flex lg:w-1/2 pub-auth-left pub-auth-left-grid flex-col justify-between p-12">
          <div className="pub-anim-fade-up">
            <div className="w-12 h-1 rounded mb-8" style={{ background: "#0d9488" }} />
            <h2 className="text-3xl font-black leading-tight mb-4" style={{ color: "#1a2b4a" }}>
              Your quotes are<br />waiting for you.
            </h2>
            <p className="text-slate-600 text-base leading-relaxed max-w-sm">
              Sign back in to pick up where you left off. Your drafts, your catalogue, and your proposals are all here.
            </p>
          </div>

          {/* Feature reminders */}
          <div className="space-y-4 pub-anim-fade-up pub-delay-200">
            <div className="flex items-start gap-3">
              <div className="pub-icon-circle-sm mt-0.5">
                <Mic className="h-4 w-4" style={{ color: "#0d9488" }} />
              </div>
              <div>
                <div className="font-semibold text-sm" style={{ color: "#1a2b4a" }}>Voice dictation ready</div>
                <div className="text-slate-500 text-xs">Talk your next quote into existence</div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="pub-icon-circle-sm mt-0.5">
                <FileText className="h-4 w-4" style={{ color: "#0d9488" }} />
              </div>
              <div>
                <div className="font-semibold text-sm" style={{ color: "#1a2b4a" }}>Branded proposals</div>
                <div className="text-slate-500 text-xs">Professional output every time</div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="pub-icon-circle-sm mt-0.5">
                <Clock className="h-4 w-4" style={{ color: "#0d9488" }} />
              </div>
              <div>
                <div className="font-semibold text-sm" style={{ color: "#1a2b4a" }}>Under 5 minutes</div>
                <div className="text-slate-500 text-xs">From inputs to finished quote</div>
              </div>
            </div>
          </div>

          <p className="text-slate-400 text-xs">© 2026 IdoYourQuotes. All rights reserved.</p>
        </div>

        {/* Right form panel */}
        <div className="flex-1 flex items-center justify-center p-6 sm:p-10 lg:p-12">
          <div className="w-full max-w-md pub-anim-fade-up">
            <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-8 sm:p-10">

              <div className="mb-8">
                <h1 className="text-2xl font-black mb-1" style={{ color: "#1a2b4a" }}>Welcome back</h1>
                <p className="text-slate-500 text-sm">Sign in to your account to continue</p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                {error && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                <div className="space-y-1.5">
                  <Label htmlFor="email" className="text-sm font-semibold" style={{ color: "#1a2b4a" }}>Email</Label>
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
                  <Label htmlFor="password" className="text-sm font-semibold" style={{ color: "#1a2b4a" }}>Password</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                  />
                </div>

                <Button
                  type="submit"
                  className="w-full font-bold text-sm shadow-md pub-btn-pulse"
                  style={{ background: "#0d9488", color: "white", padding: "14px", borderRadius: 12 }}
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Signing in...
                    </>
                  ) : (
                    "Sign In"
                  )}
                </Button>
              </form>

              <p className="mt-6 text-center text-sm text-slate-500">
                Don't have an account?{" "}
                <Link href="/register" className="font-semibold hover:underline" style={{ color: "#0d9488" }}>
                  Start your free 14-day trial
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
