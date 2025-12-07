import { useState } from "react";
import { Switch, Route, Link, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { CSVImportDialog } from "@/components/csv-import-dialog";
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Settings, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";

import NotFound from "@/pages/not-found";
import StudentsPage from "@/pages/students";
import RulesPage from "@/pages/rules";
import CharacteristicsPage from "@/pages/characteristics";
import GeneratePage from "@/pages/generate";
import ReviewPage from "@/pages/review";
import SurveysPage from "@/pages/surveys";
import SociogramPage from "@/pages/sociogram";
import ScenariosPage from "@/pages/scenarios";
import TeachersPage from "@/pages/teachers";

import type { Student, Placement, ClassConfig } from "@shared/schema";

function Router() {
  return (
    <Switch>
      <Route path="/" component={StudentsPage} />
      <Route path="/teachers" component={TeachersPage} />
      <Route path="/rules" component={RulesPage} />
      <Route path="/characteristics" component={CharacteristicsPage} />
      <Route path="/surveys" component={SurveysPage} />
      <Route path="/generate" component={GeneratePage} />
      <Route path="/review" component={ReviewPage} />
      <Route path="/sociogram" component={SociogramPage} />
      <Route path="/scenarios" component={ScenariosPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function TopNavigation() {
  const [location] = useLocation();

  const navItems = [
    { label: "Students", href: "/" },
    { label: "Teachers", href: "/teachers" },
    { label: "Requests", href: "/rules" },
    { label: "Classes", href: "/generate" },
    { label: "Solver", href: "/review" },
  ];

  const rightNavItems = [
    { label: "Settings", href: "/characteristics", icon: Settings },
    { label: "Help", href: "/surveys", icon: HelpCircle },
  ];

  return (
    <header className="flex items-center justify-between gap-4 px-4 py-3 border-b sticky top-0 z-50 bg-background">
      <nav className="flex items-center gap-1">
        <div className="w-1 h-5 bg-primary rounded-full mr-2" />
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
          <AvatarFallback className="bg-primary text-primary-foreground text-xs">
            WA
          </AvatarFallback>
        </Avatar>
      </div>
    </header>
  );
}

function AppContent() {
  const { toast } = useToast();
  const [importOpen, setImportOpen] = useState(false);

  const { data: students = [] } = useQuery<Student[]>({
    queryKey: ["/api/students"],
  });

  const { data: placements = [] } = useQuery<Placement[]>({
    queryKey: ["/api/placements"],
  });

  const { data: classConfigs = [] } = useQuery<ClassConfig[]>({
    queryKey: ["/api/class-configs"],
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

    const classMap = new Map(classConfigs.map((c) => [c.id, c.name]));
    const studentMap = new Map(students.map((s) => [s.id, s]));

    const csvRows = ["First Name,Last Name,Grade,Assigned Class"];
    
    placements.forEach((p) => {
      const student = studentMap.get(p.studentId);
      const className = classMap.get(p.classId) || "Unassigned";
      if (student) {
        csvRows.push(
          `"${student.firstName}","${student.lastName}","${student.grade}","${className}"`
        );
      }
    });

    const csvContent = csvRows.join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `class-placements-${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast({
      title: "Export complete",
      description: `Exported ${placements.length} student placements`,
    });
  };

  return (
    <div className="flex flex-col h-screen w-full">
      <TopNavigation />
      <main className="flex-1 overflow-auto">
        <Router />
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
