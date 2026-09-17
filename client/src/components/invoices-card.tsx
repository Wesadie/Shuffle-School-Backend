import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileDown, Loader2, ReceiptText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { invoiceDescription, type InvoiceView } from "@shared/invoices";
import { isLicensePlanType, licensePlanLabel } from "@shared/licence-pricing";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-ZA", { dateStyle: "medium" }).format(new Date(value));
}

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

function extractErrorMessage(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : "";
  try {
    const parsed = JSON.parse(message.slice(message.indexOf("{")));
    if (parsed?.error) return parsed.error as string;
  } catch {
    // Not a JSON error body.
  }
  return fallback;
}

export function InvoicesCard({ canManage }: { canManage: boolean }) {
  const { toast } = useToast();
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const invoiceQuery = useQuery<{ invoices: InvoiceView[] }>({
    queryKey: ["/api/account/invoices"],
    enabled: canManage,
  });
  const invoices = invoiceQuery.data?.invoices ?? [];

  const viewInvoice = async (invoice: InvoiceView) => {
    setDownloadingId(invoice.id);
    const previewWindow = window.open("", "_blank");
    if (previewWindow) previewWindow.opener = null;
    try {
      const response = await apiRequest("GET", `/api/account/invoices/${invoice.id}/pdf`);
      const blobUrl = URL.createObjectURL(await response.blob());
      if (previewWindow) {
        previewWindow.location.href = blobUrl;
      } else {
        const link = document.createElement("a");
        link.href = blobUrl;
        link.download = `${invoice.invoiceNumber}.pdf`;
        link.click();
      }
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
    } catch (error) {
      previewWindow?.close();
      toast({
        title: "Unable to open invoice",
        description: extractErrorMessage(error, "Please try again."),
        variant: "destructive",
      });
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ReceiptText className="h-5 w-5 text-primary" />
          Invoices
        </CardTitle>
        <CardDescription>Paid invoices issued for successful PayFast payments.</CardDescription>
      </CardHeader>
      <CardContent>
        {!canManage ? (
          <p className="text-sm text-muted-foreground">
            Only an account administrator can view and download invoices.
          </p>
        ) : invoiceQuery.isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : invoiceQuery.isError ? (
          <p className="text-sm text-muted-foreground">Failed to load invoices. Please try again.</p>
        ) : invoices.length === 0 ? (
          <div className="rounded-lg border border-dashed p-6 text-center">
            <ReceiptText className="mx-auto mb-2 h-8 w-8 text-muted-foreground/60" />
            <p className="font-medium">No invoices yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Paid invoices will appear here after a successful PayFast payment.
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice number</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">View / download</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.map((invoice) => {
                const planLabel = isLicensePlanType(invoice.planType)
                  ? licensePlanLabel(invoice.planType)
                  : invoice.planType;
                return (
                  <TableRow key={invoice.id} data-testid={`invoice-row-${invoice.id}`}>
                    <TableCell className="font-medium whitespace-nowrap">{invoice.invoiceNumber}</TableCell>
                    <TableCell className="whitespace-nowrap">{formatDate(invoice.invoiceDate)}</TableCell>
                    <TableCell className="min-w-64">
                      {invoiceDescription(invoice.transactionType, planLabel, invoice.learnerQuantity)}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap font-medium">
                      {formatCurrency(invoice.totalCents)}
                    </TableCell>
                    <TableCell>
                      <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">Paid</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => viewInvoice(invoice)}
                        disabled={downloadingId === invoice.id}
                        data-testid={`button-view-invoice-${invoice.id}`}
                      >
                        {downloadingId === invoice.id ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <FileDown className="mr-2 h-4 w-4" />
                        )}
                        PDF
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
