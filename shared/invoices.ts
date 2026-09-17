import type { Invoice } from "./schema";

/** Transaction types that can produce an invoice. */
export type InvoiceTransactionType = "initial" | "topup" | "renewal";

export function isInvoiceTransactionType(value: unknown): value is InvoiceTransactionType {
  return value === "initial" || value === "topup" || value === "renewal";
}

/** Human-readable line-item description shared by the PDF and the invoices list. */
export function invoiceDescription(
  transactionType: string,
  planLabel: string,
  learnerQuantity: number,
): string {
  const learners = `${learnerQuantity} learner${learnerQuantity === 1 ? "" : "s"}`;
  switch (transactionType) {
    case "topup":
      return `${planLabel} licence top-up – ${learners}`;
    case "renewal":
      return `${planLabel} licence renewal – ${learners}`;
    case "initial":
    default:
      return `${planLabel} licence – initial purchase – ${learners}`;
  }
}

/** API view of an invoice for the Licence & Billing list. */
export type InvoiceView = Omit<
  Invoice,
  "invoiceDate" | "licencePeriodStart" | "licencePeriodEnd" | "emailedAt" | "createdAt" | "updatedAt"
> & {
  invoiceDate: string;
  licencePeriodStart: string | null;
  licencePeriodEnd: string | null;
  emailedAt: string | null;
  createdAt: string;
  updatedAt: string;
};
