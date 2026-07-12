import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { queryClient } from "@/lib/queryClient";

const MAX_POLLS = 10;
const POLL_INTERVAL_MS = 2000;

export default function PayfastReturnPage() {
  const [, setLocation] = useLocation();
  const reactQueryClient = useQueryClient();
  const [checking, setChecking] = useState(true);
  const pollCount = useRef(0);

  useEffect(() => {
    let active = true;

    const checkLicense = async () => {
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
      if (isActive || pollCount.current >= MAX_POLLS) {
        setChecking(false);
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

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center space-y-6">
          <Loader2 className="h-12 w-12 mx-auto animate-spin text-primary" />
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold">Confirming your payment…</h1>
            <p className="text-muted-foreground">
              We're activating your ShuffleSchool licence. This only takes a moment.
            </p>
          </div>
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
