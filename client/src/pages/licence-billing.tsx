import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, CreditCard, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiRequest } from "@/lib/queryClient";
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

export default function LicenceBillingPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const accountContext = user?.accountContext;
  const currentLearnerLimit = accountContext?.licensedLearnerCount ?? 0;
  const isLicensed = accountContext?.subscriptionStatus === "active";

  const [learnerSelection, setLearnerSelection] = useState("40");
  const [customLearnerCount, setCustomLearnerCount] = useState("40");
  const [isSubmitting, setIsSubmitting] = useState(false);

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
              <p className="text-2xl font-semibold">{formatDate(accountContext?.licenseEndsAt)}</p>
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
    </div>
  );
}
