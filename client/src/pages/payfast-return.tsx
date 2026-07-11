import { useEffect } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { queryClient } from "@/lib/queryClient";

export default function PayfastReturnPage() {
  const [, setLocation] = useLocation();
  const reactQueryClient = useQueryClient();

  useEffect(() => {
    queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
    reactQueryClient.invalidateQueries();
  }, [reactQueryClient]);

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
