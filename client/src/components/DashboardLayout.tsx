import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { getLoginUrl } from "@/const";
import { useIsMobile } from "@/hooks/useMobile";
import { trpc } from "@/lib/trpc";
import { LayoutDashboard, LogOut, PanelLeft, Package, Settings, Crown, AlertTriangle, CreditCard, Mail } from "lucide-react";
import { CSSProperties, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from './DashboardLayoutSkeleton';
import { Button } from "./ui/button";

const menuItems = [
  { icon: LayoutDashboard, label: "Quotes", path: "/dashboard" },
  { icon: Package, label: "Catalog", path: "/catalog" },
  { icon: Settings, label: "Settings", path: "/settings" },
];

const SIDEBAR_WIDTH_KEY = "sidebar-width";
const DEFAULT_WIDTH = 280;
const MIN_WIDTH = 200;
const MAX_WIDTH = 480;

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    return saved ? parseInt(saved, 10) : DEFAULT_WIDTH;
  });
  const { loading, user } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, sidebarWidth.toString());
  }, [sidebarWidth]);

  if (loading) {
    return <DashboardLayoutSkeleton />
  }

  // Redirect to home page if not logged in
  if (!user) {
    window.location.href = "/";
    return null;
  }

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": `${sidebarWidth}px`,
        } as CSSProperties
      }
    >
      <DashboardLayoutContent setSidebarWidth={setSidebarWidth}>
        {children}
      </DashboardLayoutContent>
    </SidebarProvider>
  );
}

type DashboardLayoutContentProps = {
  children: React.ReactNode;
  setSidebarWidth: (width: number) => void;
};

function SubscriptionBanner() {
  const [, setLocation] = useLocation();
  const { data: sub } = trpc.subscription.status.useQuery();
  const { user } = useAuth();
  const [resending, setResending] = useState(false);

  // Email verification banner
  if (user && !(user as any).emailVerified) {
    const handleResend = async () => {
      setResending(true);
      try {
        const res = await fetch('/api/auth/resend-verification', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: user.email }),
        });
        if (res.ok) {
          alert('Verification email sent! Check your inbox.');
        } else {
          const data = await res.json();
          alert(data.error || 'Failed to resend');
        }
      } catch {
        alert('Failed to resend verification email');
      }
      setResending(false);
    };

    return (
      <div className="flex items-center justify-between px-4 py-2.5 text-sm bg-amber-500 text-white">
        <div className="flex items-center gap-2">
          <Mail className="h-4 w-4" />
          <span className="font-medium">
            Please verify your email to activate your free trial. Check your inbox for a verification link.
          </span>
        </div>
        <Button
          size="sm"
          variant="secondary"
          className="h-7 text-xs font-bold"
          onClick={handleResend}
          disabled={resending}
        >
          {resending ? 'Sending...' : 'Resend Email'}
        </Button>
      </div>
    );
  }

  if (!sub) return null;

  // Trial banner
  if (sub.tier === 'trial' && !sub.isTrialExpired && sub.trialDaysRemaining > 0) {
    return (
      <div className="flex items-center justify-between px-4 py-2 text-sm" style={{ backgroundColor: '#0d9488', color: 'white' }}>
        <div className="flex items-center gap-2">
          <Crown className="h-4 w-4" />
          <span className="font-medium">
            Free trial — {sub.trialDaysRemaining} day{sub.trialDaysRemaining !== 1 ? 's' : ''} remaining
          </span>
        </div>
        <Button
          size="sm"
          variant="secondary"
          className="h-7 text-xs font-bold"
          onClick={() => setLocation('/pricing')}
        >
          <CreditCard className="h-3 w-3 mr-1" />
          Choose a plan
        </Button>
      </div>
    );
  }

  // Trial expired
  if (sub.tier === 'trial' && sub.isTrialExpired) {
    return (
      <div className="flex items-center justify-between px-4 py-2 text-sm bg-red-600 text-white">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" />
          <span className="font-medium">Your free trial has expired. Subscribe to continue using IdoYourQuotes.</span>
        </div>
        <Button
          size="sm"
          variant="secondary"
          className="h-7 text-xs font-bold"
          onClick={() => setLocation('/pricing')}
        >
          Choose a plan
        </Button>
      </div>
    );
  }

  // Past due
  if (sub.status === 'past_due') {
    return (
      <div className="flex items-center justify-between px-4 py-2 text-sm bg-amber-600 text-white">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" />
          <span className="font-medium">Payment failed. Please update your payment method to avoid service interruption.</span>
        </div>
        <Button
          size="sm"
          variant="secondary"
          className="h-7 text-xs font-bold"
          onClick={() => setLocation('/settings?tab=billing')}
        >
          Update payment
        </Button>
      </div>
    );
  }

  // Cancelling at period end
  if (sub.cancelAtPeriodEnd && sub.currentPeriodEnd) {
    const endDate = new Date(sub.currentPeriodEnd).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    return (
      <div className="flex items-center justify-between px-4 py-2 text-sm bg-gray-700 text-white">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" />
          <span className="font-medium">Your {sub.tierName} plan cancels on {endDate}.</span>
        </div>
        <Button
          size="sm"
          variant="secondary"
          className="h-7 text-xs font-bold"
          onClick={() => setLocation('/settings?tab=billing')}
        >
          Resume plan
        </Button>
      </div>
    );
  }

  // Quote limit reached — big red banner
  if (sub.maxQuotesPerMonth !== -1 && sub.currentQuoteCount >= sub.maxQuotesPerMonth) {
    return (
      <div className="flex items-center justify-between px-4 py-2.5 text-sm bg-red-600 text-white">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" />
          <span className="font-medium">
            You've used all {sub.maxQuotesPerMonth} quotes this month on your {sub.tierName} plan. Upgrade to keep quoting.
          </span>
        </div>
        <Button
          size="sm"
          variant="secondary"
          className="h-7 text-xs font-bold"
          onClick={() => setLocation('/pricing')}
        >
          Upgrade Now
        </Button>
      </div>
    );
  }

  // Quote limit approaching (80%+) — amber warning
  if (sub.maxQuotesPerMonth !== -1 && sub.maxQuotesPerMonth > 0 && sub.currentQuoteCount >= Math.floor(sub.maxQuotesPerMonth * 0.8)) {
    const remaining = sub.maxQuotesPerMonth - sub.currentQuoteCount;
    return (
      <div className="flex items-center justify-between px-4 py-2 text-sm bg-amber-500 text-white">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" />
          <span className="font-medium">
            {remaining} quote{remaining !== 1 ? 's' : ''} remaining this month on your {sub.tierName} plan.
          </span>
        </div>
        <Button
          size="sm"
          variant="secondary"
          className="h-7 text-xs font-bold"
          onClick={() => setLocation('/pricing')}
        >
          View Plans
        </Button>
      </div>
    );
  }

  return null;
}

function DashboardLayoutContent({
  children,
  setSidebarWidth,
}: DashboardLayoutContentProps) {
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const activeMenuItem = menuItems.find(item => item.path === location);
  const isMobile = useIsMobile();

  useEffect(() => {
    if (isCollapsed) {
      setIsResizing(false);
    }
  }, [isCollapsed]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;

      const sidebarLeft = sidebarRef.current?.getBoundingClientRect().left ?? 0;
      const newWidth = e.clientX - sidebarLeft;
      if (newWidth >= MIN_WIDTH && newWidth <= MAX_WIDTH) {
        setSidebarWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, setSidebarWidth]);

  return (
    <>
      <div className="relative" ref={sidebarRef}>
        <Sidebar
          collapsible="icon"
          className="border-r-0"
          disableTransition={isResizing}
        >
          <SidebarHeader className="h-16 justify-center">
            <div className="flex items-center gap-3 px-2 transition-all w-full">
              <button
                onClick={toggleSidebar}
                className="h-8 w-8 flex items-center justify-center hover:bg-accent rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0"
                aria-label="Toggle navigation"
              >
                <PanelLeft className="h-4 w-4 text-muted-foreground" />
              </button>
              {!isCollapsed ? (
                <div className="flex items-center gap-2 min-w-0">
                  <img 
                    src="https://files.manuscdn.com/user_upload_by_module/session_file/310519663048135071/uMprjfIbjwvxZRuj.png" 
                    alt="IdoYourQuotes" 
                    className="h-16 object-contain"
                  />
                </div>
              ) : null}
            </div>
          </SidebarHeader>

          <SidebarContent className="gap-0">
            <SidebarMenu className="px-2 py-1">
              {menuItems.map(item => {
                const isActive = location === item.path;
                return (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton
                      isActive={isActive}
                      onClick={() => setLocation(item.path)}
                      tooltip={item.label}
                      className={`h-10 transition-all font-normal`}
                    >
                      <item.icon
                        className={`h-4 w-4 ${isActive ? "text-primary" : ""}`}
                      />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarContent>

          <SidebarFooter className="p-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-3 rounded-lg px-1 py-1 hover:bg-accent/50 transition-colors w-full text-left group-data-[collapsible=icon]:justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <Avatar className="h-9 w-9 border shrink-0">
                    <AvatarFallback className="text-xs font-medium">
                      {user?.name?.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0 group-data-[collapsible=icon]:hidden">
                    <p className="text-sm font-medium truncate leading-none">
                      {user?.name || "-"}
                    </p>
                    <p className="text-xs text-muted-foreground truncate mt-1.5">
                      {user?.email || "-"}
                    </p>
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem
                  onClick={logout}
                  className="cursor-pointer text-destructive focus:text-destructive"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Sign out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarFooter>
        </Sidebar>
        <div
          className={`absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-primary/20 transition-colors ${isCollapsed ? "hidden" : ""}`}
          onMouseDown={() => {
            if (isCollapsed) return;
            setIsResizing(true);
          }}
          style={{ zIndex: 50 }}
        />
      </div>

      <SidebarInset>
        <SubscriptionBanner />
        {isMobile && (
          <div className="flex border-b h-14 items-center justify-between bg-background/95 px-2 backdrop-blur supports-[backdrop-filter]:backdrop-blur sticky top-0 z-40">
            <div className="flex items-center gap-2">
              <SidebarTrigger className="h-9 w-9 rounded-lg bg-background" />
              <div className="flex items-center gap-3">
                <div className="flex flex-col gap-1">
                  <span className="tracking-tight text-foreground">
                    {activeMenuItem?.label ?? "Menu"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
        <main className="flex-1 p-4">{children}</main>
      </SidebarInset>
    </>
  );
}
