import { useState } from "react";
import { CreditCard, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value));
}

export default function LicenceBillingPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [learnerCount, setLearnerCount] = useState("40");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const accountContext = user?.accountContext;
  const isLicensed = accountContext?.subscriptionStatus === "active";
  const trialStatus = accountContext?.trialExpired
    ? "Expired"
    : accountContext?.subscriptionStatus === "trialing"
      ? "Active"
      : "Not trialing";

  const handleUpgrade = async () => {
    setIsSubmitting(true);
    try {
      const response = await apiRequest("POST", "/api/payments/payfast/initiate", {
        planType: "school",
        transactionType: isLicensed ? "topup" : "initial",
        learnerCount: Number(learnerCount),
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
          <CardTitle>Current licence</CardTitle>
          <CardDescription>Your account status and learner capacity.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Trial status</p>
            <p className="font-medium">{trialStatus}</p>
          </div>
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Licence status</p>
            <p className="font-medium">{accountContext?.subscriptionStatus ?? "Unknown"}</p>
          </div>
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Current learner limit</p>
            <p className="font-medium">{accountContext?.licensedLearnerCount ?? "No licensed limit"}</p>
          </div>
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Expiry date</p>
            <p className="font-medium">{formatDate(accountContext?.licenseEndsAt)}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Upgrade with PayFast</CardTitle>
          <CardDescription>Select learner capacity and continue to PayFast checkout.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="learner-count">Learner limit</Label>
            <Select value={learnerCount} onValueChange={setLearnerCount}>
              <SelectTrigger id="learner-count" className="max-w-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {learnerOptions.map((option) => (
                  <SelectItem key={option} value={String(option)}>
                    {option} learners
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button onClick={handleUpgrade} disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CreditCard className="h-4 w-4 mr-2" />}
            Upgrade with PayFast
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
