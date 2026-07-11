import { type FormEvent, useState } from "react";
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

type PlanType = "teacher" | "school";

export default function PayfastTestPage() {
  const [planType, setPlanType] = useState<PlanType>("teacher");
  const [learnerCount, setLearnerCount] = useState("30");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {

      const response = await fetch("/api/payments/payfast/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planType,
          learnerCount: Number(learnerCount),
        }),
      });

      const data = await response.json();
      if (!response.ok || typeof data.redirectUrl !== "string") {
        throw new Error(data.error || "Unable to start PayFast payment");
      }

      window.location.href = data.redirectUrl;
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to start PayFast payment");
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>PayFast Sandbox Test</CardTitle>
          <CardDescription>Temporary developer-only payment test page.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="plan-type">Plan Type</Label>
              <Select value={planType} onValueChange={(value: PlanType) => setPlanType(value)}>
                <SelectTrigger id="plan-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="teacher">Teacher</SelectItem>
                  <SelectItem value="school">School</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="learner-count">Learner Count</Label>
              <Input
                id="learner-count"
                type="number"
                min="1"
                step="1"
                value={learnerCount}
                onChange={(event) => setLearnerCount(event.target.value)}
                required
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? "Redirecting…" : "Go to PayFast Sandbox"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
