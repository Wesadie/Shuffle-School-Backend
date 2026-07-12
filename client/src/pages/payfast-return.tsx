import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { queryClient } from "@/lib/queryClient";

const MAX_POLLS = 10;
const POLL_INTERVAL_MS = 2000;

type ConfirmationStatus = "checking" | "active" | "pending";

export default function PayfastReturnPage() {
  const [, setLocation] = useLocation();
  const reactQueryClient = useQueryClient();
  const [status, setStatus] = useState<ConfirmationStatus>("checking");
  const pollCount = useRef(0);

  useEffect(() => {
    let active = true;

    const checkLicense = async () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      const result = await queryClient.fetchQuery({
        queryKey: ["/api/auth/user"],
        staleTime: 0,
      });
      return result as { accountContext?: { subscriptionStatus?: string } } | null;
    };

    const poll = async () => {
      pollCount.current += 1;
      const data = await checkLicense();

      if (!active) return;

      const isActive = data?.accountContext?.subscriptionStatus === "active";
      if (isActive) {
        setStatus("active");
        reactQueryClient.invalidateQueries();
        return;
      }

      if (pollCount.current >= MAX_POLLS) {
        setStatus("pending");
        reactQueryClient.invalidateQueries();
        return;
      }

      setTimeout(poll, POLL_INTERVAL_MS);
    };

    poll();

    return () => {
      active = false;
    };
  }, [reactQueryClient]);

  if (status === "checking") {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center space-y-6">
          <Loader2 className="h-12 w-12 mx-auto animate-spin text-primary" />
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold">Confirming your payment…</h1>
            <p className="text-muted-foreground">
              We're waiting for PayFast to notify ShuffleSchool and activate your licence.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (status === "pending") {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center space-y-6">
          <AlertCircle className="h-12 w-12 mx-auto text-amber-600" />
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold">Payment received, activation pending</h1>
            <p className="text-muted-foreground">
              PayFast redirected you back successfully, but ShuffleSchool has not received the final payment notification yet. Please refresh in a minute or contact support if your licence does not activate.
            </p>
          </div>
          <Button onClick={() => window.location.reload()}>Check again</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center space-y-6">
        <CheckCircle2 className="h-12 w-12 mx-auto text-primary" />
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">Payment successful</h1>
          <p className="text-muted-foreground">
            Your payment was received and your ShuffleSchool licence has been refreshed.
          </p>
        </div>
        <Button onClick={() => setLocation("/dashboard")}>Return to ShuffleSchool</Button>
      </div>
    </div>
  );
}
