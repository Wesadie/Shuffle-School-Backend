import { useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";

export default function PayfastCancelPage() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    setLocation("/");
  }, [setLocation]);

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">Payment cancelled</h1>
          <p className="text-muted-foreground">
            Your payment was cancelled and no licence changes were made.
          </p>
        </div>
        <Button onClick={() => setLocation("/")}>Go to Pricing page</Button>
      </div>
    </div>
  );
}
