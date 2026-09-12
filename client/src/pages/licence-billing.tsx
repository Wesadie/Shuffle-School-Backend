import { useEffect, useMemo, useState } from "react";
import { Ban, CheckCircle2, CreditCard, Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";

const learnerOptions = [40, 80, 120, 160, 200, 240, 280, 320];
const customLearnerValue = "custom";
const pricePerLearnerCents = 2500;

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value));
}

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function extractErrorMessage(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : "";
  try {
    const parsed = JSON.parse(message.slice(message.indexOf("{")));
    if (parsed?.error) return parsed.error as string;
  } catch {
    // Not a JSON error body — fall through to the fallback.
  }
  return fallback;
}

export default function LicenceBillingPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const accountContext = user?.accountContext;
  const currentLearnerLimit = accountContext?.licensedLearnerCount ?? 0;
  const isLicensed = accountContext?.subscriptionStatus === "active";
  const accountRole = accountContext?.accountRole ?? null;
  const canManageSubscription = accountRole === "owner" || accountRole === "admin";
  const subscriptionCancelled = accountContext?.cancelAtPeriodEnd === true;
  const expiryDate = formatDate(accountContext?.licenseEndsAt);

  const [learnerSelection, setLearnerSelection] = useState("40");
  const [customLearnerCount, setCustomLearnerCount] = useState("40");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  useEffect(() => {
    if (currentLearnerLimit > 0) {
      const nextOption = learnerOptions.find((option) => option > currentLearnerLimit);
      setLearnerSelection(nextOption ? String(nextOption) : customLearnerValue);
      setCustomLearnerCount(String(currentLearnerLimit));
    }
  }, [currentLearnerLimit]);

  const newLearnerLimit = useMemo(() => {
    const rawValue = learnerSelection === customLearnerValue ? customLearnerCount : learnerSelection;
    const parsed = Number.parseInt(rawValue, 10);
    return Number.isInteger(parsed) ? parsed : 0;
  }, [customLearnerCount, learnerSelection]);

  const billableLearners = isLicensed
    ? Math.max(newLearnerLimit - currentLearnerLimit, 0)
    : Math.max(newLearnerLimit, 0);
  const amountPayableCents = billableLearners * pricePerLearnerCents;
  const amountPayable = formatCurrency(amountPayableCents);
  const isInvalidUpgrade = isLicensed && newLearnerLimit <= currentLearnerLimit;
  const canSubmit = newLearnerLimit > 0 && !isInvalidUpgrade && amountPayableCents > 0 && !isSubmitting;

  const handleLearnerSelectionChange = (value: string) => {
    setLearnerSelection(value);
    if (value === customLearnerValue) {
      setCustomLearnerCount(String(currentLearnerLimit || 40));
    }
  };

  const handleCustomLearnerChange = (value: string) => {
    setCustomLearnerCount(value.replace(/\D/g, ""));
  };

  const handleUpgrade = async () => {
    setIsSubmitting(true);
    try {
      const response = await apiRequest("POST", "/api/payments/payfast/initiate", {
        planType: "school",
        transactionType: isLicensed ? "topup" : "initial",
        learnerCount: newLearnerLimit,
      });
      const data = await response.json();
      if (typeof data.redirectUrl !== "string") {
        throw new Error("PayFast redirect URL was not returned");
      }
      console.log("[PayFast Client Redirect]", {
        debugFirstPayfastParam: data.debugFirstPayfastParam,
        firstUrlParam: new URL(data.redirectUrl).searchParams.keys().next().value,
      });
      window.location.href = data.redirectUrl;
    } catch (error) {
      setIsSubmitting(false);
      toast({
        title: "Unable to start PayFast checkout",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleCancelSubscription = async () => {
    setIsCancelling(true);
    try {
      await apiRequest("POST", "/api/payments/subscription/cancel", { confirm: true });
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      setIsCancelDialogOpen(false);
      toast({
        title: "Subscription cancelled",
        description: `Your ShuffleSchool licence remains active until ${expiryDate}. It will not renew automatically.`,
      });
    } catch (error) {
      toast({
        title: "Unable to cancel subscription",
        description: extractErrorMessage(error, "Please try again."),
        variant: "destructive",
      });
    } finally {
      setIsCancelling(false);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Licence & Billing</h1>
        <p className="text-muted-foreground">
          Review your current licence and upgrade learner capacity with PayFast.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Current Licence</CardTitle>
          <CardDescription>Your active licence summary.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2 text-sm font-medium text-emerald-700">
            <CheckCircle2 className="h-4 w-4" />
            {isLicensed ? "Active" : accountContext?.subscriptionStatus ?? "Not active"}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Licensed learners</p>
              <p className="text-2xl font-semibold">{currentLearnerLimit || "—"}</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Expires</p>
              <p className="text-2xl font-semibold">{expiryDate}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Upgrade Licence</CardTitle>
          <CardDescription>
            Top-ups only charge for additional learners and do not change your licence expiry date.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="learner-count">Learner limit</Label>
            <Select value={learnerSelection} onValueChange={handleLearnerSelectionChange}>
              <SelectTrigger id="learner-count" className="max-w-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {learnerOptions.map((option) => (
                  <SelectItem key={option} value={String(option)} disabled={isLicensed && option <= currentLearnerLimit}>
                    {option} learners
                  </SelectItem>
                ))}
                <SelectItem value={customLearnerValue}>Custom...</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {learnerSelection === customLearnerValue && (
            <div className="space-y-2 max-w-xs">
              <Label htmlFor="custom-learner-count">Number of learners</Label>
              <Input
                id="custom-learner-count"

                inputMode="numeric"
                pattern="[0-9]*"
                value={customLearnerCount}
                onChange={(event) => handleCustomLearnerChange(event.target.value)}
              />
              {isInvalidUpgrade && (
                <p className="text-sm text-destructive">
                  Enter a whole number greater than your current learner limit of {currentLearnerLimit}.
                </p>
              )}
            </div>
          )}

          <div className="rounded-lg border bg-muted/30 p-4 space-y-3 max-w-md">
            <div className="flex justify-between gap-4 text-sm">
              <span className="text-muted-foreground">Current learners:</span>
              <span className="font-medium">{currentLearnerLimit}</span>
            </div>
            <div className="flex justify-between gap-4 text-sm">
              <span className="text-muted-foreground">New learners:</span>
              <span className="font-medium">{newLearnerLimit || "—"}</span>
            </div>
            <div className="flex justify-between gap-4 text-sm">
              <span className="text-muted-foreground">Additional learners:</span>
              <span className="font-medium">{billableLearners}</span>
            </div>
            <div className="flex justify-between gap-4 border-t pt-3 text-base">
              <span className="font-semibold">Amount payable:</span>
              <span className="font-bold">{amountPayable}</span>
            </div>
          </div>

          <Button onClick={handleUpgrade} disabled={!canSubmit}>
            {isSubmitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CreditCard className="h-4 w-4 mr-2" />}
            Upgrade with PayFast – {amountPayable}
          </Button>
        </CardContent>
      </Card>

      {isLicensed && (
        <Card>
          <CardHeader>
            <CardTitle>Cancel Subscription</CardTitle>
            <CardDescription>
              Stop your licence from renewing automatically. Your school keeps full access until the
              licence expires.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Subscription status</p>
                {subscriptionCancelled ? (
                  <div className="flex items-center gap-2 text-sm font-medium text-amber-700">
                    <Ban className="h-4 w-4" />
                    Active – subscription cancelled (not renewing)
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-sm font-medium text-emerald-700">
                    <CheckCircle2 className="h-4 w-4" />
                    Active – renews automatically
                  </div>
                )}
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Current expiry date</p>
                <p className="text-2xl font-semibold">{expiryDate}</p>
              </div>
            </div>

            {subscriptionCancelled ? (
              <>
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
                  Your subscription has been cancelled. Your ShuffleSchool licence remains active
                  until {expiryDate}. It will not renew automatically.
                </div>
                <Button variant="outline" disabled>
                  <Ban className="h-4 w-4 mr-2" />
                  Subscription Cancelled
                </Button>
              </>
            ) : canManageSubscription ? (
              <>
                <p className="text-sm text-muted-foreground">
                  Cancelling only stops future renewals. Your licence stays active until it expires,
                  no account data is deleted, and no refund is issued for the remaining period.
                </p>
                <Button variant="destructive" onClick={() => setIsCancelDialogOpen(true)}>
                  Cancel Subscription
                </Button>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Only an account administrator can cancel the school's subscription. Please contact
                your school's administrator.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <AlertDialog open={isCancelDialogOpen} onOpenChange={setIsCancelDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Cancel your subscription?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Cancelling your subscription will stop your licence from renewing. You will continue
              to have access until your current licence expires on{" "}
              <span className="font-semibold text-foreground">{expiryDate}</span>. No learners,
              teachers, classes, reports or requests are deleted, and no refund is issued for the
              remaining period.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isCancelling}>Keep Subscription</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isCancelling}
              onClick={(event) => {
                event.preventDefault();
                handleCancelSubscription();
              }}
            >
              {isCancelling && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Yes, Cancel Subscription
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
