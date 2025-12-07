import { useState } from "react";
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { CSVImportDialog } from "@/components/csv-import-dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

import NotFound from "@/pages/not-found";
import StudentsPage from "@/pages/students";
import RulesPage from "@/pages/rules";
import CharacteristicsPage from "@/pages/characteristics";
import GeneratePage from "@/pages/generate";
import ReviewPage from "@/pages/review";
import SurveysPage from "@/pages/surveys";
import SociogramPage from "@/pages/sociogram";

import type { Student, Placement, ClassConfig } from "@shared/schema";

function Router() {
  return (
    <Switch>
      <Route path="/" component={StudentsPage} />
      <Route path="/rules" component={RulesPage} />
      <Route path="/characteristics" component={CharacteristicsPage} />
      <Route path="/surveys" component={SurveysPage} />
      <Route path="/generate" component={GeneratePage} />
      <Route path="/review" component={ReviewPage} />
      <Route path="/sociogram" component={SociogramPage} />
      <Route component={NotFound} />
    </Switch>
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

  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <AppSidebar
          studentCount={students.length}
          onImport={() => setImportOpen(true)}
          onExport={handleExport}
        />
        <div className="flex flex-col flex-1 min-w-0">
          <header className="flex items-center justify-between gap-2 p-2 border-b sticky top-0 z-50 bg-background">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
            <ThemeToggle />
          </header>
          <main className="flex-1 overflow-auto">
            <Router />
          </main>
        </div>
      </div>
      <CSVImportDialog open={importOpen} onOpenChange={setImportOpen} />
    </SidebarProvider>
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
