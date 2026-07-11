import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ThemeToggle } from "@/components/theme-toggle";
import { Settings, HelpCircle, Users, Link2, Sliders, Sparkles, ClipboardList } from "lucide-react";
import { Link } from "wouter";
import logoImage from "@assets/shuffle-school-logo.png";

export default function HelpPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="flex items-center justify-between gap-4 px-6 py-4 border-b sticky top-0 z-50 bg-background">
        <Link href="/">
          <div className="flex items-center gap-3 cursor-pointer">
            <img src={logoImage} alt="ShuffleSchool Logo" className="h-8 w-8 rounded-md object-contain" />
            <span className="text-xl font-semibold">ShuffleSchool</span>
          </div>
        </Link>
        <nav className="flex items-center gap-2">
          <Link href="/settings">
            <span className="px-3 py-1.5 text-sm font-medium rounded-md cursor-pointer text-muted-foreground hover-elevate flex items-center gap-1.5" data-testid="nav-settings">
              <Settings className="h-4 w-4" />
              Settings
            </span>
          </Link>
          <Link href="/help">
            <span className="px-3 py-1.5 text-sm font-medium rounded-md cursor-pointer text-primary flex items-center gap-1.5" data-testid="nav-help">
              <HelpCircle className="h-4 w-4" />
              Help
            </span>
          </Link>
          <ThemeToggle />
        </nav>
      </header>

      <main className="flex-1 p-8">
        <div className="max-w-3xl mx-auto space-y-6">
          <h1 className="text-2xl font-bold">Help Guide</h1>
          
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Students
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-2">
              <p>Import your student data using CSV files. The system supports:</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>First name, last name, grade, and current class</li>
                <li>Gender and other characteristics</li>
                <li>Parent requests and notes</li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Link2 className="h-5 w-5" />
                Requests (Rules)
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-2">
              <p>Set up pairing and separation rules for students:</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li><strong>Pair:</strong> Students that should be placed together</li>
                <li><strong>Separate:</strong> Students that should not be in the same class</li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sliders className="h-5 w-5" />
                Characteristics
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-2">
              <p>Define characteristics to balance across classes:</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Category types (e.g., reading level: high, medium, low)</li>
                <li>Percentage types for numeric distributions</li>
                <li>Set priorities for balancing importance</li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5" />
                Classes (Generate)
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-2">
              <p>Generate optimized class placements:</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Configure class names and capacities</li>
                <li>Run the solver to create balanced classes</li>
                <li>View conflict warnings and balance scores</li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ClipboardList className="h-5 w-5" />
                Solver (Review)
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-2">
              <p>Review and adjust class placements:</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Drag and drop students between classes</li>
                <li>Use the boost feature for optimization suggestions</li>
                <li>Export final placements to CSV</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
