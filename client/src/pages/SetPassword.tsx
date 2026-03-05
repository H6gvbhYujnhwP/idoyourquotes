import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, AlertCircle, CheckCircle2, UserPlus } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function SetPassword() {
  const [, setLocation] = useLocation();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(true);
  const [tokenValid, setTokenValid] = useState(false);
  const [email, setEmail] = useState("");

  // Get token from URL
  const token = new URLSearchParams(window.location.search).get("token");

  // Validate token on mount
  useEffect(() => {
    if (!token) {
      setError("Missing invitation token. Please use the link from your invitation email.");
      setValidating(false);
      return;
    }

    fetch(`/api/auth/validate-invite?token=${encodeURIComponent(token)}`)
      .then(async (res) => {
        const data = await res.json();
        if (res.ok && data.valid) {
          setTokenValid(true);
          setEmail(data.email || "");
        } else {
          setError(data.error || "Invalid invitation link");
        }
      })
      .catch(() => {
        setError("Failed to validate invitation. Please try again.");
      })
      .finally(() => {
        setValidating(false);
      });
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/auth/set-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password, name: name.trim() || undefined }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Failed to set password");
        setLoading(false);
        return;
      }

      // Auto-logged in by the server — redirect to dashboard
      window.location.href = "/dashboard";
    } catch (err) {
      setError("An error occurred. Please try again.");
      setLoading(false);
    }
  };

  // Loading state while validating token
  if (validating) {
    return (
      <div className="min-h-screen flex flex-col bg-slate-50">
        <header className="border-b bg-white">
          <div className="container flex h-36 items-center justify-between">
            <Link href="/" className="flex items-center gap-2">
              <img 
                src="https://files.manuscdn.com/user_upload_by_module/session_file/310519663048135071/uMprjfIbjwvxZRuj.png" 
                alt="IdoYourQuotes" 
                className="h-32 object-contain"
              />
            </Link>
          </div>
        </header>
        <main className="flex-1 flex items-center justify-center p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Validating your invitation...</span>
          </div>
        </main>
      </div>
    );
  }

  // Invalid token state
  if (!tokenValid) {
    return (
      <div className="min-h-screen flex flex-col bg-slate-50">
        <header className="border-b bg-white">
          <div className="container flex h-36 items-center justify-between">
            <Link href="/" className="flex items-center gap-2">
              <img 
                src="https://files.manuscdn.com/user_upload_by_module/session_file/310519663048135071/uMprjfIbjwvxZRuj.png" 
                alt="IdoYourQuotes" 
                className="h-32 object-contain"
              />
            </Link>
          </div>
        </header>
        <main className="flex-1 flex items-center justify-center p-4">
          <Card className="w-full max-w-md">
            <CardHeader className="text-center">
              <CardTitle className="text-xl">Invitation Problem</CardTitle>
            </CardHeader>
            <CardContent>
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            </CardContent>
            <CardFooter className="justify-center">
              <Link href="/login" className="text-sm text-primary hover:underline font-medium">
                Go to Login
              </Link>
            </CardFooter>
          </Card>
        </main>
      </div>
    );
  }

  // Valid token — show set password form
  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <header className="border-b bg-white">
        <div className="container flex h-36 items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <img 
              src="https://files.manuscdn.com/user_upload_by_module/session_file/310519663048135071/uMprjfIbjwvxZRuj.png" 
              alt="IdoYourQuotes" 
              className="h-32 object-contain"
            />
          </Link>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-3 h-12 w-12 rounded-full bg-teal-50 flex items-center justify-center">
              <UserPlus className="h-6 w-6 text-teal-600" />
            </div>
            <CardTitle className="text-2xl">Welcome to the team</CardTitle>
            <CardDescription>
              Set your password to activate your account
              {email && (
                <span className="block mt-1 font-medium text-foreground">{email}</span>
              )}
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
                <Label htmlFor="name">Your Name</Label>
                <Input
                  id="name"
                  type="text"
                  placeholder="e.g. John Smith"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="At least 8 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm Password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="Re-enter your password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                />
              </div>
              {password.length > 0 && (
                <div className="flex items-center gap-2 text-sm">
                  {password.length >= 8 ? (
                    <CheckCircle2 className="h-4 w-4 text-teal-600" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-muted-foreground" />
                  )}
                  <span className={password.length >= 8 ? "text-teal-600" : "text-muted-foreground"}>
                    At least 8 characters
                  </span>
                </div>
              )}
            </CardContent>
            <CardFooter className="flex flex-col gap-4 pt-6">
              <Button type="submit" className="w-full" disabled={loading || password.length < 8 || password !== confirmPassword}>
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Setting up your account...
                  </>
                ) : (
                  "Set Password & Join Team"
                )}
              </Button>
            </CardFooter>
          </form>
        </Card>
      </main>
    </div>
  );
}
