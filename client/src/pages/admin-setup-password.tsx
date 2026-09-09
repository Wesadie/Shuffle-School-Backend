import { FormEvent, useEffect, useState } from "react";
import { Loader2, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiUrl } from "@/lib/apiUrl";
import { queryClient } from "@/lib/queryClient";
import { supabase } from "@/integrations/supabase/client";

export default function AdminSetupPasswordPage() {
  const [sessionReady, setSessionReady] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setHasSession(Boolean(data.session));
      setSessionReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      setHasSession(Boolean(session));
      setSessionReady(true);
    });
    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Use at least 8 characters for your password.");
      return;
    }
    if (password !== confirmPassword) {
      setError("The passwords do not match.");
      return;
    }

    setIsSubmitting(true);
    try {
      const { error: passwordError } = await supabase.auth.updateUser({ password });
      if (passwordError) throw passwordError;

      const { data } = await supabase.auth.getSession();
      if (!data.session) throw new Error("Your invitation session has expired.");
      const response = await fetch(apiUrl("/api/onboarding/supabase"), {
        method: "POST",
        headers: { Authorization: `Bearer ${data.session.access_token}` },
      });
      if (!response.ok) throw new Error("We could not activate your administrator access.");

      queryClient.clear();
      window.location.href = "/dashboard";
    } catch (setupError) {
      setError(setupError instanceof Error ? setupError.message : "Password setup failed. Please request a new invitation.");
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4 py-10">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
            <LockKeyhole className="h-5 w-5" />
          </div>
          <CardTitle>Set up your administrator account</CardTitle>
          <CardDescription>Create your private ShuffleSchool password to accept the invitation.</CardDescription>
        </CardHeader>
        <CardContent>
          {!sessionReady ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Verifying invitation…
            </div>
          ) : !hasSession ? (
            <div className="space-y-3 text-center">
              <p className="text-sm text-destructive">This invitation link is invalid or has expired.</p>
              <p className="text-sm text-muted-foreground">Ask your Primary Administrator to send a new invitation.</p>
            </div>
          ) : (
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <Label htmlFor="new-password">New password</Label>
                <Input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  disabled={isSubmitting}
                  data-testid="input-new-admin-password"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirm password</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  disabled={isSubmitting}
                  data-testid="input-confirm-admin-password"
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button className="w-full" type="submit" disabled={isSubmitting} data-testid="button-activate-admin-account">
                {isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Activating…</> : "Create password and continue"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
