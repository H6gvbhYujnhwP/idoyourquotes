import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, AlertCircle, CheckCircle2, Crown, CreditCard, Shield, Clock } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { TRADE_SECTOR_OPTIONS } from "@/lib/tradeSectors";

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
    <div className="min-h-screen flex flex-col bg-slate-50">
      {/* Header */}
      <header className="border-b bg-white">
        <div className="container flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <img 
              src="https://files.manuscdn.com/user_upload_by_module/session_file/310519663048135071/uMprjfIbjwvxZRuj.png" 
              alt="IdoYourQuotes" 
              className="h-12 object-contain"
            />
          </Link>
          <Link href="/pricing" className="text-sm text-muted-foreground hover:text-foreground font-medium">
            View Pricing
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md space-y-4">
          {/* Trial Banner */}
          <div className="rounded-xl border-2 border-teal-200 bg-teal-50 px-5 py-4 text-center">
            <div className="flex items-center justify-center gap-2 mb-2">
              <Crown className="h-5 w-5 text-teal-600" />
              <span className="font-bold text-teal-800 text-lg">14-Day Free Trial</span>
            </div>
            <p className="text-sm text-teal-700 mb-3">
              Full access to all features. No credit card required.
            </p>
            <div className="flex items-center justify-center gap-4 text-xs text-teal-600">
              <span className="flex items-center gap-1">
                <CreditCard className="h-3 w-3" /> No card needed
              </span>
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" /> Cancel anytime
              </span>
              <span className="flex items-center gap-1">
                <Shield className="h-3 w-3" /> No commitment
              </span>
            </div>
          </div>

          <Card>
            <CardHeader className="text-center">
              <CardTitle className="text-2xl">Start your free trial</CardTitle>
              <CardDescription>
                Create professional quotes in minutes — we know you'll love it
              </CardDescription>
            </CardHeader>
            <form onSubmit={handleSubmit}>
              <CardContent className="space-y-4">
                {error && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
                <div className="space-y-2">
                  <Label htmlFor="name">Full Name</Label>
                  <Input
                    id="name"
                    type="text"
                    placeholder="John Smith"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoComplete="name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="companyName">Company / Organization Name <span className="text-red-500">*</span></Label>
                  <Input
                    id="companyName"
                    type="text"
                    placeholder="Acme Construction Ltd"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    required
                    autoComplete="organization"
                  />
                  <p className="text-xs text-muted-foreground">
                    This will be used as your organization name for team collaboration
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tradeSector">Your Business Sector <span className="text-red-500">*</span></Label>
                  <Select value={tradeSector} onValueChange={setTradeSector}>
                    <SelectTrigger id="tradeSector">
                      <SelectValue placeholder="Select your primary business sector..." />
                    </SelectTrigger>
                    <SelectContent className="max-h-[300px]">
                      {TRADE_SECTOR_OPTIONS.map((sector) => (
                        <SelectItem key={sector.value} value={sector.value}>
                          {sector.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email <span className="text-red-500">*</span></Label>
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
                <div className="space-y-2">
                  <Label htmlFor="password">Password <span className="text-red-500">*</span></Label>
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
                          <div className="w-3 h-3 rounded-full border border-muted-foreground" />
                        )}
                        <span className={req.met ? "text-green-600" : "text-muted-foreground"}>
                          {req.text}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirm Password <span className="text-red-500">*</span></Label>
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
              </CardContent>
              <CardFooter className="flex flex-col gap-4">
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating account...
                    </>
                  ) : (
                    "Start My Free Trial"
                  )}
                </Button>
                <p className="text-xs text-center text-muted-foreground">
                  Your 14-day trial starts immediately. Only enter card details after 14 days if you're happy — we know you'll love it.
                </p>
                <p className="text-sm text-muted-foreground text-center">
                  Already have an account?{" "}
                  <Link href="/login" className="text-primary hover:underline font-medium">
                    Sign in
                  </Link>
                </p>
              </CardFooter>
            </form>
          </Card>
        </div>
      </main>
    </div>
  );
}
