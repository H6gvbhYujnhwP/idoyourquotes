import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import DashboardLayout from "./components/DashboardLayout";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Pricing from "./pages/Pricing";
import Features from "./pages/Features";
import Dashboard from "./pages/Dashboard";
import QuoteRouter from "./pages/QuoteRouter";
import Catalog from "./pages/Catalog";
import Settings from "./pages/Settings";
import AdminPanel from "./pages/AdminPanel";
import SetPassword from "./pages/SetPassword";
import BrandedProposalWorkspace from "./pages/BrandedProposalWorkspace";

function Router() {
  return (
    <Switch>
      {/* Public landing page */}
      <Route path="/" component={Home} />
      
      {/* Public marketing pages */}
      <Route path="/features" component={Features} />
      <Route path="/pricing" component={Pricing} />
      
      {/* Auth pages */}
      <Route path="/login" component={Login} />
      <Route path="/register" component={Register} />
      
      {/* Protected dashboard routes */}
      <Route path="/dashboard">
        <DashboardLayout>
          <Dashboard />
        </DashboardLayout>
      </Route>
      
      <Route path="/quotes/:id">
        <DashboardLayout>
          <QuoteRouter />
        </DashboardLayout>
      </Route>

      {/* Phase 4B Delivery C — Branded Proposal Workspace.
          Reached when a Pro/Team user picks Tile 3 ("Branded with your
          artwork and company story") on the Generate-PDF picker AND
          they have a brochure uploaded. The screen reads its own
          quoteId from the URL, fires brandedProposal.generateDraft on
          mount, and lets the user edit/regenerate per chapter before
          rendering the final PDF. Tier gating is enforced server-side
          on every brandedProposal.* endpoint, so no client-side gate
          is layered on top of the route. */}
      <Route path="/branded-proposal/:quoteId">
        <DashboardLayout>
          <BrandedProposalWorkspace />
        </DashboardLayout>
      </Route>
      
      <Route path="/catalog">
        <DashboardLayout>
          <Catalog />
        </DashboardLayout>
      </Route>
      
      <Route path="/settings">
        <DashboardLayout>
          <Settings />
        </DashboardLayout>
      </Route>
      
      {/* Invite set-password page */}
      <Route path="/set-password" component={SetPassword} />
      
      {/* Admin panel — obscured URL */}
      <Route path="/manage-7k9x2m4q8r" component={AdminPanel} />
      
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
