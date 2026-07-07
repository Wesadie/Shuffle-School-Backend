import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ThemeToggle } from "@/components/theme-toggle";
import { Users, Shuffle, BarChart3, Settings, HelpCircle } from "lucide-react";
import { Link } from "wouter";
import logoImage from "@assets/ChatGPT_Image_Dec_8,_2025,_01_03_50_PM_1765191843507.png";

export default function LandingPage() {
  const handleLogin = () => {
    window.location.href = "/api/login";
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="flex items-center justify-between gap-4 px-6 py-4 border-b sticky top-0 z-50 bg-background">
        <div className="flex items-center gap-3">
          <img src={logoImage} alt="ShuffleSchool Logo" className="h-8 w-8 rounded-md object-contain" />
          <span className="text-xl font-semibold">ShuffleSchool</span>
        </div>
        <nav className="flex items-center gap-2">
          <Link href="/settings">
            <span className="px-3 py-1.5 text-sm font-medium rounded-md cursor-pointer text-muted-foreground hover-elevate flex items-center gap-1.5" data-testid="nav-settings">
              <Settings className="h-4 w-4" />
              Settings
            </span>
          </Link>
          <Link href="/help">
            <span className="px-3 py-1.5 text-sm font-medium rounded-md cursor-pointer text-muted-foreground hover-elevate flex items-center gap-1.5" data-testid="nav-help">
              <HelpCircle className="h-4 w-4" />
              Help
            </span>
          </Link>
          <ThemeToggle />
        </nav>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center p-8">
        <div className="max-w-2xl text-center space-y-8">
          <div className="space-y-4">
            <img src={logoImage} alt="ShuffleSchool Logo" className="h-20 w-20 mx-auto rounded-lg object-contain" />
            <h1 className="text-4xl font-bold">Welcome to ShuffleSchool</h1>
            <p className="text-xl text-muted-foreground">
              K-12 Class Placement Tool for creating balanced, optimized class lists
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-left">
            <Card>
              <CardContent className="pt-6 space-y-2">
                <Users className="h-8 w-8 text-primary" />
                <h3 className="font-semibold">Student Management</h3>
                <p className="text-sm text-muted-foreground">Import and manage student data with characteristics</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6 space-y-2">
                <Shuffle className="h-8 w-8 text-primary" />
                <h3 className="font-semibold">Smart Placement</h3>
                <p className="text-sm text-muted-foreground">Automated class generation with pairing and separation rules</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6 space-y-2">
                <BarChart3 className="h-8 w-8 text-primary" />
                <h3 className="font-semibold">Balance Metrics</h3>
                <p className="text-sm text-muted-foreground">Review and optimize class balance with visual analytics</p>
              </CardContent>
            </Card>
          </div>

          <Button size="lg" onClick={handleLogin} data-testid="button-login">
            Log In to Get Started
          </Button>
        </div>
      </main>

      <footer className="border-t py-4 text-center text-sm text-muted-foreground">
        Powered by intelligent balancing
      </footer>
    </div>
  );
}
