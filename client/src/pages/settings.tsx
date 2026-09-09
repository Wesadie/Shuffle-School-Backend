import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ThemeToggle } from "@/components/theme-toggle";
import { ArrowRightLeft, CreditCard, Settings, HelpCircle, Loader2, AlertCircle, Mail, Shield, Trash2, UserPlus } from "lucide-react";

import { Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import type { AdministratorView, AppSettings } from "@shared/schema";
import logoImage from "@assets/shuffle-school-logo.png";

const extractErrorMessage = (error: unknown, fallback: string) => {
  const message = error instanceof Error ? error.message : "";
  try {
    const parsed = JSON.parse(message.slice(message.indexOf("{")));
    if (parsed?.error) return parsed.error as string;
  } catch {
    // Not a JSON error body — fall through to the fallback.
  }
  return fallback;
};

export default function SettingsPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [isAddAdminOpen, setIsAddAdminOpen] = useState(false);
  const [isTransferOpen, setIsTransferOpen] = useState(false);
  const [isEmailOpen, setIsEmailOpen] = useState(false);
  const [addAdminForm, setAddAdminForm] = useState({ firstName: "", lastName: "", email: "" });
  const [transferTargetId, setTransferTargetId] = useState("");
  const [transferConfirmed, setTransferConfirmed] = useState(false);
  const [emailForm, setEmailForm] = useState("");

  const { data: appSettings, isLoading, isError, error } = useQuery<AppSettings>({
    queryKey: ["/api/app-settings"],
  });

  const administratorsQuery = useQuery<AdministratorView[] | null>({
    queryKey: ["/api/administrators"],
  });
  const administrators = administratorsQuery.data ?? [];
  const primaryAdministrator = administrators.find((admin) => admin.isPrimary);
  const isSelfPrimary = Boolean(primaryAdministrator && primaryAdministrator.userId === user?.id);
  const transferCandidates = administrators.filter((admin) => !admin.isPrimary && admin.status === "active");

  const addAdminMutation = useMutation({
    mutationFn: (input: { firstName: string; lastName: string; email: string }) =>
      apiRequest("POST", "/api/administrators", input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/administrators"] });
      setIsAddAdminOpen(false);
      setAddAdminForm({ firstName: "", lastName: "", email: "" });
      toast({
        title: "Invitation sent",
        description: "The administrator will remain pending until they create their password and activate their account.",
      });
    },
    onError: (mutationError) => {
      toast({
        title: "Failed to invite administrator",
        description: extractErrorMessage(mutationError, "Please check the details and try again."),
        variant: "destructive",
      });
    },
  });

  const removeAdminMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/administrators/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/administrators"] });
      toast({ title: "Administrator removed" });
    },
    onError: (mutationError) => {
      toast({
        title: "Failed to remove administrator",
        description: extractErrorMessage(mutationError, "Please try again."),
        variant: "destructive",
      });
    },
  });

  const transferPrimaryMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest("POST", `/api/administrators/${id}/transfer-primary`, { confirm: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/administrators"] });
      setIsTransferOpen(false);
      setTransferTargetId("");
      setTransferConfirmed(false);
      toast({ title: "Primary Administrator transferred", description: "Ownership has moved to the new Primary Administrator." });
    },
    onError: (mutationError) => {
      toast({
        title: "Failed to transfer ownership",
        description: extractErrorMessage(mutationError, "Please try again."),
        variant: "destructive",
      });
    },
  });

  const updatePrimaryEmailMutation = useMutation({
    mutationFn: (email: string) => apiRequest("PATCH", "/api/administrators/primary-email", { email }),
    onSuccess: (_data, email) => {
      queryClient.invalidateQueries({ queryKey: ["/api/administrators"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      setIsEmailOpen(false);
      toast({ title: "Email updated", description: `The Primary Administrator email is now ${email}.` });
    },
    onError: (mutationError) => {
      toast({
        title: "Failed to update email",
        description: extractErrorMessage(mutationError, "Please try again."),
        variant: "destructive",
      });
    },
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
          <Link href="/settings/billing">
            <span className="px-3 py-1.5 text-sm font-medium rounded-md cursor-pointer text-muted-foreground hover-elevate flex items-center gap-1.5" data-testid="nav-billing">
              <CreditCard className="h-4 w-4" />
              Licence & Billing
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
              <CardTitle>Administrators</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {administratorsQuery.isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : administratorsQuery.isError ? (
                <div className="flex items-center gap-3 py-4 text-muted-foreground">
                  <AlertCircle className="h-5 w-5" />
                  <p className="text-sm">Failed to load administrators. Please sign in to manage administrators.</p>
                </div>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">
                    The Primary Administrator owns this school's account. Additional administrators have the same app
                    permissions, and the Primary Administrator cannot be removed — ownership must be transferred first.
                  </p>
                  <div className="space-y-2">
                    {administrators.map((admin) => (
                      <div
                        key={admin.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2"
                        data-testid={`administrator-${admin.id}`}
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-medium truncate">
                              {[admin.firstName, admin.lastName].filter(Boolean).join(" ") || admin.email || "Administrator"}
                            </p>
                            {admin.isPrimary ? (
                              <Badge className="gap-1" data-testid="badge-primary-administrator">
                                <Shield className="h-3 w-3" />
                                Primary Administrator
                              </Badge>
                            ) : (
                              <Badge variant="secondary">Administrator</Badge>
                            )}
                            {admin.status === "invited" && <Badge variant="outline">Invited / Pending</Badge>}
                          </div>
                          <p className="truncate text-sm text-muted-foreground">{admin.email}</p>
                        </div>
                        <div className="flex items-center gap-1">
                          {admin.isPrimary && isSelfPrimary && (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setEmailForm(admin.email ?? "");
                                  setIsEmailOpen(true);
                                }}
                                data-testid="button-edit-primary-email"
                              >
                                <Mail className="mr-1 h-3.5 w-3.5" /> Edit email
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setTransferTargetId("");
                                  setTransferConfirmed(false);
                                  setIsTransferOpen(true);
                                }}
                                data-testid="button-change-primary-administrator"
                              >
                                <ArrowRightLeft className="mr-1 h-3.5 w-3.5" /> Change Primary Administrator
                              </Button>
                            </>
                          )}
                          {!admin.isPrimary && isSelfPrimary && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => removeAdminMutation.mutate(admin.id)}
                              disabled={removeAdminMutation.isPending}
                              aria-label="Remove administrator"
                              data-testid={`button-remove-administrator-${admin.id}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  {isSelfPrimary && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setAddAdminForm({ firstName: "", lastName: "", email: "" });
                        setIsAddAdminOpen(true);
                      }}
                      data-testid="button-add-administrator"
                    >
                      <UserPlus className="mr-1 h-4 w-4" /> Add Administrator
                    </Button>
                  )}
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

          <Dialog open={isAddAdminOpen} onOpenChange={setIsAddAdminOpen}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Invite Administrator</DialogTitle>
                <DialogDescription>
                  We'll email a secure invitation to this administrator. They will create their own password and join
                  this school's existing ShuffleSchool account.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="admin-first-name">First name *</Label>
                    <Input
                      id="admin-first-name"
                      value={addAdminForm.firstName}
                      onChange={(event) => setAddAdminForm({ ...addAdminForm, firstName: event.target.value })}
                      data-testid="input-administrator-first-name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="admin-last-name">Last name *</Label>
                    <Input
                      id="admin-last-name"
                      value={addAdminForm.lastName}
                      onChange={(event) => setAddAdminForm({ ...addAdminForm, lastName: event.target.value })}
                      data-testid="input-administrator-last-name"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="admin-email">Email *</Label>
                  <Input
                    id="admin-email"
                    type="email"
                    value={addAdminForm.email}
                    onChange={(event) => setAddAdminForm({ ...addAdminForm, email: event.target.value })}
                    data-testid="input-administrator-email"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsAddAdminOpen(false)}>Cancel</Button>
                <Button
                  onClick={() => addAdminMutation.mutate(addAdminForm)}
                  disabled={
                    !addAdminForm.firstName.trim() ||
                    !addAdminForm.lastName.trim() ||
                    !addAdminForm.email.trim() ||
                    addAdminMutation.isPending
                  }
                  data-testid="button-save-administrator"
                >
                  {addAdminMutation.isPending ? "Sending invitation…" : "Send Invitation"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={isTransferOpen} onOpenChange={setIsTransferOpen}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Change Primary Administrator</DialogTitle>
                <DialogDescription>
                  Transfer account ownership to another administrator. This is a significant account change and
                  requires confirmation.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="space-y-2">
                  <Label>New Primary Administrator</Label>
                  <Select value={transferTargetId || undefined} onValueChange={setTransferTargetId}>
                    <SelectTrigger data-testid="select-transfer-target">
                      <SelectValue placeholder="Select an administrator…" />
                    </SelectTrigger>
                    <SelectContent>
                      {transferCandidates.map((admin) => (
                        <SelectItem key={admin.id} value={admin.id}>
                          {[admin.firstName, admin.lastName].filter(Boolean).join(" ") || admin.email}
                          {admin.email ? ` (${admin.email})` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <label className="flex items-start gap-2 text-sm" data-testid="label-transfer-confirm">
                  <Checkbox
                    className="mt-0.5"
                    checked={transferConfirmed}
                    onCheckedChange={(checked) => setTransferConfirmed(checked === true)}
                  />
                  <span className="text-muted-foreground">
                    I understand the new Primary Administrator will own this account and cannot be removed, and I will
                    become a normal administrator.
                  </span>
                </label>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsTransferOpen(false)}>Cancel</Button>
                <Button
                  onClick={() => transferPrimaryMutation.mutate(transferTargetId)}
                  disabled={!transferTargetId || !transferConfirmed || transferPrimaryMutation.isPending}
                  data-testid="button-confirm-transfer-primary"
                >
                  {transferPrimaryMutation.isPending ? "Transferring…" : "Transfer Ownership"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={isEmailOpen} onOpenChange={setIsEmailOpen}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Edit Primary Administrator email</DialogTitle>
                <DialogDescription>
                  Update the Primary Administrator email address if your school email changes.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="primary-email">New email address</Label>
                  <Input
                    id="primary-email"
                    type="email"
                    value={emailForm}
                    onChange={(event) => setEmailForm(event.target.value)}
                    data-testid="input-primary-email"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsEmailOpen(false)}>Cancel</Button>
                <Button
                  onClick={() => updatePrimaryEmailMutation.mutate(emailForm.trim())}
                  disabled={!emailForm.trim() || updatePrimaryEmailMutation.isPending}
                  data-testid="button-save-primary-email"
                >
                  {updatePrimaryEmailMutation.isPending ? "Saving…" : "Save email"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </main>
    </div>
  );
}
