import { useEffect, useState } from "react";
import { Switch, Route, Link, useLocation } from "wouter";
import { getAuthHeaders, queryClient } from "./lib/queryClient";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { CSVImportDialog } from "@/components/csv-import-dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { BookOpen, HelpCircle, LayoutDashboard, LogOut, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import logoImage from "@assets/shuffle-school-logo.png";

import NotFound from "@/pages/not-found";
import DashboardPage from "@/pages/dashboard";
import StudentsPage from "@/pages/students";
import RulesPage from "@/pages/rules";
import CharacteristicsPage from "@/pages/characteristics";
import GeneratePage from "@/pages/generate";
import ReviewPage from "@/pages/review";
import SurveysPage from "@/pages/surveys";
import SociogramPage from "@/pages/sociogram";
import ScenariosPage from "@/pages/scenarios";
import TeachersPage from "@/pages/teachers";
import LandingPage from "@/pages/landing";
import SettingsPage from "@/pages/settings";
import HelpPage from "@/pages/help";
import TutorialsPage from "@/pages/tutorials";
import AuthHandoffPage from "@/pages/auth-handoff";

import type { Student, Placement, ClassConfig } from "@shared/schema";

function RedirectToDashboard() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    setLocation("/dashboard");
  }, [setLocation]);

  return null;
}

function AuthenticatedRouter() {
  return (
    <Switch>
      <Route path="/" component={RedirectToDashboard} />
      <Route path="/dashboard" component={DashboardPage} />
      <Route path="/students" component={StudentsPage} />
      <Route path="/teachers" component={TeachersPage} />
      <Route path="/rules" component={RulesPage} />
      <Route path="/characteristics" component={CharacteristicsPage} />
      <Route path="/surveys" component={SurveysPage} />
      <Route path="/generate" component={GeneratePage} />
      <Route path="/review" component={ReviewPage} />
      <Route path="/sociogram" component={SociogramPage} />
      <Route path="/scenarios" component={ScenariosPage} />
      <Route path="/settings" component={SettingsPage} />
      <Route path="/tutorials" component={TutorialsPage} />
      <Route path="/help" component={HelpPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function PublicRouter() {
  return (
    <Switch>
      <Route path="/" component={LandingPage} />
      <Route path="/settings" component={SettingsPage} />
      <Route path="/help" component={HelpPage} />
      <Route component={LandingPage} />
    </Switch>
  );
}

function TopNavigation() {
  const [location] = useLocation();
  const { user } = useAuth();

  const navItems = [
    { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { label: "Students", href: "/students" },
    { label: "Teachers", href: "/teachers" },
    { label: "Requests", href: "/rules" },
    { label: "Classes", href: "/generate" },
    { label: "Solver", href: "/review" },
  ];

  const rightNavItems = [
    { label: "Settings", href: "/settings", icon: Settings },
    { label: "Tutorials", href: "/tutorials", icon: BookOpen },
    { label: "Help", href: "/help", icon: HelpCircle },
  ];

  const handleLogout = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      await supabase.auth.signOut();
      queryClient.clear();
      window.location.href = "https://preview--school-solver-site.lovable.app/login";
    } else {
      window.location.href = "/api/logout";
    }
  };

  const getInitials = () => {
    if (user?.firstName && user?.lastName) {
      return `${user.firstName[0]}${user.lastName[0]}`.toUpperCase();
    }
    if (user?.email) {
      return user.email[0].toUpperCase();
    }
    return "U";
  };

  return (
    <header className="flex items-center justify-between gap-4 px-4 py-3 border-b sticky top-0 z-50 bg-background">
      <nav className="flex items-center gap-1">
        <Link href="/dashboard">
          <div className="flex items-center gap-2 mr-4 cursor-pointer">
            <img src={logoImage} alt="ShuffleSchool Logo" className="h-7 w-7 rounded-md object-contain" />
            <span className="font-semibold hidden sm:inline">ShuffleSchool</span>
          </div>
        </Link>
        {navItems.map((item) => {
          const isActive = location === item.href;
          return (
            <Link key={item.href} href={item.href}>
              <span
                className={cn(
                  "px-3 py-1.5 text-sm font-medium rounded-md cursor-pointer transition-colors",
                  isActive
                    ? "text-primary"
                    : "text-muted-foreground hover-elevate"
                )}
                data-testid={`nav-${item.label.toLowerCase()}`}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>

      <div className="flex items-center gap-2">
        {rightNavItems.map((item) => {
          const isActive = location === item.href;
          return (
            <Link key={item.href} href={item.href}>
              <span
                className={cn(
                  "px-3 py-1.5 text-sm font-medium rounded-md cursor-pointer transition-colors flex items-center gap-1.5",
                  isActive
                    ? "text-primary"
                    : "text-muted-foreground hover-elevate"
                )}
                data-testid={`nav-${item.label.toLowerCase()}`}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
        <ThemeToggle />
        <div className="w-px h-6 bg-border mx-1" />
        <Avatar className="h-8 w-8 cursor-pointer" data-testid="avatar-user">
          {user?.profileImageUrl && (
            <AvatarImage src={user.profileImageUrl} alt={user.firstName || "User"} className="object-cover" />
          )}
          <AvatarFallback className="bg-primary text-primary-foreground text-xs">
            {getInitials()}
          </AvatarFallback>
        </Avatar>
        <Button size="icon" variant="ghost" onClick={handleLogout} data-testid="button-logout">
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}

function AppContent() {
  const { toast } = useToast();
  const { user, isAuthenticated, isLoading } = useAuth();
  const [importOpen, setImportOpen] = useState(false);
  const [location] = useLocation();

  // Cross-domain auth handoff: runs before auth gate so unauthenticated
  // users arriving from Lovable can establish a session.
  if (location.startsWith("/auth/handoff")) {
    return <AuthHandoffPage />;
  }

  const { data: students = [] } = useQuery<Student[]>({
    queryKey: ["/api/students"],
    enabled: isAuthenticated,
  });

  const { data: placements = [] } = useQuery<Placement[]>({
    queryKey: ["/api/placements"],
    enabled: isAuthenticated,
  });

  const { data: classConfigs = [] } = useQuery<ClassConfig[]>({
    queryKey: ["/api/class-configs"],
    enabled: isAuthenticated,
  });

  const handleExport = async () => {
    if (placements.length === 0) {
      toast({
        title: "No placements to export",
        description: "Generate classes first before exporting",
        variant: "destructive",
      });
      return;
    }

    try {
      const res = await fetch("/api/exports/class-placements.csv", {
        credentials: "include",
        headers: await getAuthHeaders(),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        toast({
          title: body?.code === "TRIAL_EXPORT_RESTRICTED" ? "Upgrade required" : "Export failed",
          description: body?.message || "Final exports are not available for this workspace.",
          variant: "destructive",
        });
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `class-placements-${new Date().toISOString().split("T")[0]}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast({ title: "Export complete", description: `Exported ${placements.length} student placements` });
    } catch {
      toast({ title: "Export failed", variant: "destructive" });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <PublicRouter />;
  }

  const accountContext = user?.accountContext;
  const trialEndsAt = accountContext?.trialEndsAt ? new Date(accountContext.trialEndsAt) : null;
  const trialDaysRemaining = trialEndsAt
    ? Math.max(0, Math.ceil((trialEndsAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000)))
    : null;
  const trialUsesRemaining = accountContext?.subscriptionStatus === "trialing"
    ? Math.max(0, 3 - (accountContext.successfulSolverGenerations || 0))
    : null;

  return (
    <div className="flex flex-col h-screen w-full">
      <TopNavigation />
      {accountContext?.subscriptionStatus === "trialing" && (
        <div className={cn(
          "border-b px-4 py-2 text-sm",
          accountContext.trialExpired ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"
        )}>
          {accountContext.trialExpired
            ? "Trial expired: this workspace is read-only until you upgrade. Your data is preserved."
            : `Trial: ${trialDaysRemaining ?? 0} day${trialDaysRemaining === 1 ? "" : "s"} remaining · ${trialUsesRemaining} of 3 solver generations remaining · final exports unlock after upgrade.`}
        </div>
      )}
      <main className="flex-1 overflow-auto">
        <AuthenticatedRouter />
      </main>
      <CSVImportDialog open={importOpen} onOpenChange={setImportOpen} />
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="system">
        <TooltipProvider>
          <AppContent />
          <Toaster />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
