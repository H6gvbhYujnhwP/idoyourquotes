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
import Dashboard from "./pages/Dashboard";
import QuoteWorkspace from "./pages/QuoteWorkspace";
import Catalog from "./pages/Catalog";
import Settings from "./pages/Settings";

function Router() {
  return (
    <Switch>
      {/* Public landing page */}
      <Route path="/" component={Home} />
      
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
          <QuoteWorkspace />
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
