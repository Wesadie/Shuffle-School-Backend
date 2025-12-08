import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ThemeToggle } from "@/components/theme-toggle";
import { Settings, HelpCircle } from "lucide-react";
import { Link } from "wouter";
import logoImage from "@assets/ChatGPT_Image_Dec_8,_2025,_01_03_50_PM_1765191843507.png";

export default function SettingsPage() {
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
            <span className="px-3 py-1.5 text-sm font-medium rounded-md cursor-pointer text-primary flex items-center gap-1.5" data-testid="nav-settings">
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

      <main className="flex-1 p-8">
        <div className="max-w-2xl mx-auto space-y-6">
          <h1 className="text-2xl font-bold">Settings</h1>
          
          <Card>
            <CardHeader>
              <CardTitle>Appearance</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Theme</p>
                  <p className="text-sm text-muted-foreground">Toggle between light and dark mode</p>
                </div>
                <ThemeToggle />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>About</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-sm text-muted-foreground">
                ShuffleSchool is a K-12 class placement tool designed to help schools create balanced, optimized class lists.
              </p>
              <p className="text-sm text-muted-foreground">
                Version 1.0.0
              </p>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
