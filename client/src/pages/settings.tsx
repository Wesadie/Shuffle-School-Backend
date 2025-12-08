import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ThemeToggle } from "@/components/theme-toggle";
import { Settings, HelpCircle, Loader2, AlertCircle } from "lucide-react";
import { Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { AppSettings } from "@shared/schema";
import logoImage from "@assets/ChatGPT_Image_Dec_8,_2025,_01_03_50_PM_1765191843507.png";

export default function SettingsPage() {
  const { toast } = useToast();
  const { data: appSettings, isLoading, isError, error } = useQuery<AppSettings>({
    queryKey: ["/api/app-settings"],
  });

  const updateSettingsMutation = useMutation({
    mutationFn: async (updates: Partial<AppSettings>) => {
      return apiRequest("PUT", "/api/app-settings", updates);
    },
    onMutate: async (updates) => {
      await queryClient.cancelQueries({ queryKey: ["/api/app-settings"] });
      const previousSettings = queryClient.getQueryData<AppSettings>(["/api/app-settings"]);
      queryClient.setQueryData<AppSettings>(["/api/app-settings"], (old) => {
        if (!old) return old;
        return { ...old, ...updates };
      });
      return { previousSettings };
    },
    onSuccess: () => {
      toast({
        title: "Settings saved",
        description: "Your survey settings have been updated.",
      });
    },
    onError: (error, _variables, context) => {
      if (context?.previousSettings) {
        queryClient.setQueryData(["/api/app-settings"], context.previousSettings);
      }
      toast({
        title: "Failed to save settings",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/app-settings"] });
    },
  });

  const handleMaxFriendNominationsChange = (value: number) => {
    updateSettingsMutation.mutate({ maxFriendNominations: value });
  };

  const handleToggle = (key: "allowTeacherStudentRequests" | "allowTeacherTeacherRequests", value: boolean) => {
    updateSettingsMutation.mutate({ [key]: value });
  };

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
              <CardTitle>Survey Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : isError ? (
                <div className="flex items-center gap-3 py-4 text-muted-foreground">
                  <AlertCircle className="h-5 w-5" />
                  <p className="text-sm">Failed to load settings. Please sign in to manage settings.</p>
                </div>
              ) : (
                <>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="font-medium">Characteristics</p>
                        <p className="text-sm text-muted-foreground">Configure characteristics for student surveys</p>
                      </div>
                      <Link href="/characteristics">
                        <Button variant="outline" data-testid="button-characteristic-settings">
                          Characteristic Settings
                        </Button>
                      </Link>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <p className="font-medium">Friendship Preferences</p>
                      <p className="text-sm text-muted-foreground">Maximum number of friend nominations allowed per student</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((num) => (
                        <Button
                          key={num}
                          variant={appSettings?.maxFriendNominations === num ? "default" : "outline"}
                          size="sm"
                          onClick={() => handleMaxFriendNominationsChange(num)}
                          disabled={updateSettingsMutation.isPending}
                          data-testid={`button-friend-nominations-${num}`}
                        >
                          {num}
                        </Button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="font-medium">Allow Teachers to add Student Requests</p>
                      <p className="text-sm text-muted-foreground">Teachers can suggest student pairings and separations</p>
                    </div>
                    <Switch
                      checked={appSettings?.allowTeacherStudentRequests ?? true}
                      onCheckedChange={(checked) => handleToggle("allowTeacherStudentRequests", checked)}
                      disabled={updateSettingsMutation.isPending}
                      data-testid="switch-teacher-student-requests"
                    />
                  </div>

                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="font-medium">Allow Teachers to add Teacher Requests</p>
                      <p className="text-sm text-muted-foreground">Teachers can request specific student placements</p>
                    </div>
                    <Switch
                      checked={appSettings?.allowTeacherTeacherRequests ?? true}
                      onCheckedChange={(checked) => handleToggle("allowTeacherTeacherRequests", checked)}
                      disabled={updateSettingsMutation.isPending}
                      data-testid="switch-teacher-teacher-requests"
                    />
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Appearance</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between gap-4">
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
