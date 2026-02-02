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
} from "lucide-react";
import { useLocation } from "wouter";

export default function Home() {
  const { user, loading } = useAuth();
  const [, setLocation] = useLocation();

  const handleGetStarted = () => {
    if (user) {
      setLocation("/dashboard");
    } else {
      window.location.href = getLoginUrl();
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-lg bg-primary flex items-center justify-center">
              <FileText className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold tracking-tight">IdoYourQuotes</span>
          </div>
          <div className="flex items-center gap-4">
            {loading ? null : user ? (
              <Button onClick={() => setLocation("/dashboard")}>
                Go to Dashboard
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            ) : (
              <Button onClick={handleGetStarted}>
                Get Started
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="py-20 md:py-32">
        <div className="container">
          <div className="max-w-4xl mx-auto text-center">
            <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight mb-6">
              We do your quotes.
            </h1>
            <p className="text-xl md:text-2xl text-muted-foreground mb-8 max-w-2xl mx-auto">
              Turn tenders, calls, and chaos into professional quotes. 
              Nothing gets sent without your approval.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button size="lg" className="text-lg px-8 py-6" onClick={handleGetStarted}>
                Start Quoting
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
              <Button size="lg" variant="outline" className="text-lg px-8 py-6">
                See How It Works
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Trust Bar */}
      <section className="py-8 bg-muted/50 border-y">
        <div className="container">
          <div className="flex flex-wrap justify-center gap-8 md:gap-16 text-muted-foreground">
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              <span className="font-medium">Your data stays private</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5" />
              <span className="font-medium">You approve everything</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              <span className="font-medium">Quotes in minutes, not hours</span>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20 md:py-28">
        <div className="container">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              From tender to quote in four steps
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Upload the tender. We'll help you finish the quote.
            </p>
          </div>

          <div className="grid md:grid-cols-4 gap-8 max-w-5xl mx-auto">
            {[
              {
                step: "1",
                icon: Upload,
                title: "Inputs",
                description: "Upload PDFs, images, audio recordings, or paste text. All your evidence in one place.",
              },
              {
                step: "2",
                icon: Brain,
                title: "Interpretation",
                description: "Define what symbols and terms mean for this tender. Lock in your understanding.",
              },
              {
                step: "3",
                icon: Calculator,
                title: "Internal Estimate",
                description: "Work out your costs, time, and risks privately. This stays between you and your team.",
              },
              {
                step: "4",
                icon: Send,
                title: "Quote",
                description: "Generate a clean, professional quote. Only what your client needs to see.",
              },
            ].map((item) => (
              <Card key={item.step} className="relative border-2 hover:border-primary/50 transition-colors">
                <div className="absolute -top-4 left-4 h-8 w-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-sm">
                  {item.step}
                </div>
                <CardContent className="pt-8 pb-6">
                  <item.icon className="h-10 w-10 text-primary mb-4" />
                  <h3 className="text-xl font-semibold mb-2">{item.title}</h3>
                  <p className="text-muted-foreground text-sm">{item.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Input Types */}
      <section className="py-20 md:py-28 bg-muted/30">
        <div className="container">
          <div className="grid md:grid-cols-2 gap-12 items-center max-w-5xl mx-auto">
            <div>
              <h2 className="text-3xl md:text-4xl font-bold mb-6">
                Accept any input format
              </h2>
              <p className="text-lg text-muted-foreground mb-8">
                Whether it's a formal tender document, a quick phone call, or an email chain, 
                we help you capture and organize everything.
              </p>
              <div className="grid grid-cols-2 gap-4">
                {[
                  { icon: FileText, label: "PDF Documents" },
                  { icon: FileImage, label: "Images & Drawings" },
                  { icon: Mic, label: "Audio Recordings" },
                  { icon: Mail, label: "Emails & Text" },
                ].map((item) => (
                  <div key={item.label} className="flex items-center gap-3 p-3 rounded-lg bg-card border">
                    <item.icon className="h-5 w-5 text-primary" />
                    <span className="font-medium">{item.label}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-card rounded-2xl border-2 p-8 shadow-lg">
              <div className="space-y-4">
                <div className="h-12 bg-muted rounded-lg flex items-center px-4 gap-3">
                  <FileText className="h-5 w-5 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">tender_specification.pdf</span>
                </div>
                <div className="h-12 bg-muted rounded-lg flex items-center px-4 gap-3">
                  <FileImage className="h-5 w-5 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">site_drawing_v2.jpg</span>
                </div>
                <div className="h-12 bg-muted rounded-lg flex items-center px-4 gap-3">
                  <Mic className="h-5 w-5 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">client_call_notes.mp3</span>
                </div>
                <div className="h-12 bg-primary/10 rounded-lg flex items-center px-4 gap-3 border-2 border-dashed border-primary/30">
                  <Upload className="h-5 w-5 text-primary" />
                  <span className="text-sm text-primary font-medium">Drop files here or click to upload</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Key Principle */}
      <section className="py-20 md:py-28">
        <div className="container">
          <div className="max-w-3xl mx-auto text-center">
            <blockquote className="text-2xl md:text-3xl font-medium text-foreground mb-6 leading-relaxed">
              "The system helps professionals think better. 
              It never replaces professional judgement."
            </blockquote>
            <p className="text-lg text-muted-foreground">
              AI assists. You decide. Every quote is reviewed and approved by you before it goes anywhere.
            </p>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 md:py-28 bg-primary text-primary-foreground">
        <div className="container">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-3xl md:text-4xl font-bold mb-6">
              Ready to simplify your quoting?
            </h2>
            <p className="text-xl opacity-90 mb-8">
              Join trades, contractors, and consultants who trust IdoYourQuotes 
              to turn chaos into professional quotes.
            </p>
            <Button 
              size="lg" 
              variant="secondary" 
              className="text-lg px-8 py-6"
              onClick={handleGetStarted}
            >
              Get Started Free
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 border-t bg-card">
        <div className="container">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
                <FileText className="h-4 w-4 text-primary-foreground" />
              </div>
              <span className="font-bold">IdoYourQuotes</span>
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
