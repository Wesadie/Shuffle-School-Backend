import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Pencil, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { BILLING_DEFAULT_COUNTRY } from "@shared/billing-details";

export interface AccountBillingDetailsView {
  accountId: string;
  billingName: string | null;
  organisationName: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  province: string | null;
  postalCode: string | null;
  country: string | null;
  billingEmail: string | null;
  phone: string | null;
  updatedAt: string;
}

interface BillingFormState {
  billingName: string;
  organisationName: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  province: string;
  postalCode: string;
  country: string;
  billingEmail: string;
  phone: string;
}

const emptyForm: BillingFormState = {
  billingName: "",
  organisationName: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  province: "",
  postalCode: "",
  country: BILLING_DEFAULT_COUNTRY,
  billingEmail: "",
  phone: "",
};

function formFromBilling(billing: AccountBillingDetailsView | null): BillingFormState {
  if (!billing) return { ...emptyForm };
  return {
    billingName: billing.billingName ?? "",
    organisationName: billing.organisationName ?? "",
    addressLine1: billing.addressLine1 ?? "",
    addressLine2: billing.addressLine2 ?? "",
    city: billing.city ?? "",
    province: billing.province ?? "",
    postalCode: billing.postalCode ?? "",
    country: billing.country ?? BILLING_DEFAULT_COUNTRY,
    billingEmail: billing.billingEmail ?? "",
    phone: billing.phone ?? "",
  };
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

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="space-y-1 min-w-0">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="font-medium break-words">{value?.trim() ? value : "—"}</p>
    </div>
  );
}

export function BillingDetailsCard({
  canManage,
  planType,
}: {
  canManage: boolean;
  planType: string | null;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState<BillingFormState>(emptyForm);

  // Plan rule: the School plan bills an organisation, so its name is
  // required; it is optional for the Teacher and Head of Grade plans.
  const organisationRequired = planType === "school";

  const billingQuery = useQuery<{ billingDetails: AccountBillingDetailsView | null }>({
    queryKey: ["/api/account/billing-details"],
  });
  const billing = billingQuery.data?.billingDetails ?? null;

  useEffect(() => {
    if (isEditing) setForm(formFromBilling(billing));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditing]);

  const saveMutation = useMutation({
    mutationFn: (input: BillingFormState) =>
      apiRequest("PUT", "/api/account/billing-details", input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/account/billing-details"] });
      setIsEditing(false);
      toast({
        title: "Billing details saved",
        description: "Your billing details have been updated for this account.",
      });
    },
    onError: (error) => {
      toast({
        title: "Unable to save billing details",
        description: extractErrorMessage(error, "Please check the details and try again."),
        variant: "destructive",
      });
    },
  });

  const set = (key: keyof BillingFormState) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    saveMutation.mutate(form);
  };

  const requiredFieldsValid =
    form.billingName.trim() &&
    form.addressLine1.trim() &&
    form.city.trim() &&
    form.province.trim() &&
    form.postalCode.trim() &&
    form.country.trim() &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.billingEmail.trim()) &&
    (!organisationRequired || form.organisationName.trim());

  const addressLines = [billing?.addressLine1, billing?.addressLine2]
    .map((line) => line?.trim())
    .filter(Boolean)
    .join(", ");

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div className="space-y-1.5">
          <CardTitle>Billing Details</CardTitle>
          <CardDescription>The name and address used for this account's invoices.</CardDescription>
        </div>
        {canManage && !isEditing && (
          billing ? (
            <Button variant="outline" onClick={() => setIsEditing(true)} data-testid="button-edit-billing-details">
              <Pencil className="h-4 w-4 mr-2" /> Edit
            </Button>
          ) : (
            <Button onClick={() => setIsEditing(true)} data-testid="button-add-billing-details">
              <Plus className="h-4 w-4 mr-2" /> Add billing details
            </Button>
          )
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {billingQuery.isLoading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : billingQuery.isError ? (
          <p className="text-sm text-muted-foreground">
            Failed to load billing details. Please try again.
          </p>
        ) : isEditing ? (
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="billing-name">Billing name *</Label>
                <Input
                  id="billing-name"
                  value={form.billingName}
                  onChange={set("billingName")}
                  autoComplete="billing name"
                  data-testid="input-billing-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="billing-organisation">
                  School/Organisation name{organisationRequired ? " *" : ""}
                </Label>
                <Input
                  id="billing-organisation"
                  value={form.organisationName}
                  onChange={set("organisationName")}
                  autoComplete="billing organization"
                  data-testid="input-billing-organisation"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="billing-address-1">Billing address *</Label>
              <Input
                id="billing-address-1"
                value={form.addressLine1}
                onChange={set("addressLine1")}
                autoComplete="billing address-line1"
                data-testid="input-billing-address-1"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="billing-address-2">Address line 2</Label>
              <Input
                id="billing-address-2"
                value={form.addressLine2}
                onChange={set("addressLine2")}
                autoComplete="billing address-line2"
                data-testid="input-billing-address-2"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="billing-city">City *</Label>
                <Input
                  id="billing-city"
                  value={form.city}
                  onChange={set("city")}
                  autoComplete="billing address-level2"
                  data-testid="input-billing-city"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="billing-province">Province *</Label>
                <Input
                  id="billing-province"
                  value={form.province}
                  onChange={set("province")}
                  autoComplete="billing address-level1"
                  data-testid="input-billing-province"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="billing-postal-code">Postal code *</Label>
                <Input
                  id="billing-postal-code"
                  value={form.postalCode}
                  onChange={set("postalCode")}
                  autoComplete="billing postal-code"
                  data-testid="input-billing-postal-code"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="billing-country">Country *</Label>
                <Input
                  id="billing-country"
                  value={form.country}
                  onChange={set("country")}
                  autoComplete="billing country-name"
                  data-testid="input-billing-country"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="billing-email">Billing email *</Label>
                <Input
                  id="billing-email"
                  type="email"
                  value={form.billingEmail}
                  onChange={set("billingEmail")}
                  autoComplete="billing email"
                  data-testid="input-billing-email"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="billing-phone">Phone number</Label>
                <Input
                  id="billing-phone"
                  type="tel"
                  value={form.phone}
                  onChange={set("phone")}
                  autoComplete="billing tel"
                  data-testid="input-billing-phone"
                />
              </div>
            </div>

            {organisationRequired && !form.organisationName.trim() && (
              <p className="text-sm text-destructive" data-testid="text-billing-organisation-required">
                The School plan requires a school/organisation name.
              </p>
            )}

            <div className="flex items-center gap-2">
              <Button
                type="submit"
                disabled={!requiredFieldsValid || saveMutation.isPending}
                data-testid="button-save-billing-details"
              >
                {saveMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Save billing details
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsEditing(false)}
                disabled={saveMutation.isPending}
              >
                <X className="h-4 w-4 mr-2" /> Cancel
              </Button>
            </div>
          </form>
        ) : billing ? (
          <div className="grid gap-4 sm:grid-cols-2" data-testid="billing-details-view">
            <Field label="Billing name" value={billing.billingName} />
            <Field label="School/Organisation" value={billing.organisationName} />
            <Field label="Billing address" value={addressLines || null} />
            <Field label="City" value={billing.city} />
            <Field label="Province" value={billing.province} />
            <Field
              label="Postal code"
              value={[billing.postalCode, billing.country].filter(Boolean).join(", ") || null}
            />
            <Field label="Billing email" value={billing.billingEmail} />
            <Field label="Phone number" value={billing.phone} />
          </div>
        ) : canManage ? (
          <p className="text-sm text-muted-foreground">
            No billing details have been added for this account yet. Add them so invoices can be
            issued correctly.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            No billing details have been added yet. Please contact your school's administrator to
            add billing details.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
