import { pool } from "./db";
import type { PoolClient } from "pg";
import { pricePerLearnerCents, type LicensePlanType } from "@shared/licence-pricing";
import type { Invoice, InvoiceBillingSnapshot } from "@shared/schema";
import type { InvoiceView } from "@shared/invoices";
import type { PaymentTransactionType } from "./licenseService";

/**
 * Invoice issuance for successful PayFast payments.
 *
 * Rules enforced here:
 * - Amounts are ALWAYS recomputed from the central pricing configuration
 *   (price per learner × learner quantity). The request amount is only used
 *   as a cross-check — never as the source of truth.
 * - VAT is not applicable (0 cents) — prices are VAT-inclusive-free, so
 *   subtotal = total paid.
 * - The customer's billing details are snapshotted onto the invoice row at
 *   creation, so later edits to account_billing_details never change an
 *   issued invoice.
 * - One invoice per PayFast payment reference (unique index + advisory
 *   lock), so duplicate ITNs never produce duplicate invoices.
 */

export interface CreateInvoiceInput {
  accountId: string;
  payfastPaymentId: string;
  transactionId: string;
  transactionType: PaymentTransactionType;
  planType: LicensePlanType;
  learnerQuantity: number;
  amountCents: number;
  licencePeriodStart: string | null;
  licencePeriodEnd: string | null;
}

interface InvoiceRow {
  id: string;
  accountId: string;
  invoiceNumber: string;
  invoiceDate: Date;
  payfastPaymentId: string;
  transactionId: string | null;
  transactionType: string;
  status: string;
  planType: string;
  learnerQuantity: number;
  pricePerLearnerCents: number;
  subtotalCents: number;
  vatCents: number;
  totalCents: number;
  currency: string;
  billingSnapshot: InvoiceBillingSnapshot | null;
  licencePeriodStart: Date | null;
  licencePeriodEnd: Date | null;
  emailedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const INVOICE_COLUMNS = `id, account_id AS "accountId", invoice_number AS "invoiceNumber",
       invoice_date AS "invoiceDate", payfast_payment_id AS "payfastPaymentId",
       transaction_id AS "transactionId", transaction_type AS "transactionType", status,
       plan_type AS "planType", learner_quantity AS "learnerQuantity",
       price_per_learner_cents AS "pricePerLearnerCents", subtotal_cents AS "subtotalCents",
       vat_cents AS "vatCents", total_cents AS "totalCents", currency,
       billing_snapshot AS "billingSnapshot",
       licence_period_start AS "licencePeriodStart", licence_period_end AS "licencePeriodEnd",
       emailed_at AS "emailedAt", created_at AS "createdAt", updated_at AS "updatedAt"`;

function toInvoice(row: InvoiceRow): Invoice {
  return {
    ...row,
    transactionType: row.transactionType,
    planType: row.planType,
  } as unknown as Invoice;
}

function toInvoiceView(row: InvoiceRow): InvoiceView {
  return {
    ...row,
    invoiceDate: row.invoiceDate.toISOString(),
    licencePeriodStart: row.licencePeriodStart ? row.licencePeriodStart.toISOString() : null,
    licencePeriodEnd: row.licencePeriodEnd ? row.licencePeriodEnd.toISOString() : null,
    emailedAt: row.emailedAt ? row.emailedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  } as unknown as InvoiceView;
}

function formatInvoiceNumber(year: number, number_: number): string {
  return `SS-${year}-${String(number_).padStart(5, "0")}`;
}

function currentSouthAfricanYear(): number {
  const sast = new Date(Date.now() + 2 * 60 * 60 * 1000);
  return sast.getUTCFullYear();
}

/** Next sequential invoice number for the current South African year (atomic upsert). */
async function nextInvoiceNumber(client: PoolClient): Promise<string> {
  const year = currentSouthAfricanYear();
  const result = await client.query<{ lastNumber: number }>(
    `INSERT INTO invoice_counters (year, last_number)
     VALUES ($1, 1)
     ON CONFLICT (year) DO UPDATE SET last_number = invoice_counters.last_number + 1
     RETURNING last_number AS "lastNumber"`,
    [year],
  );
  return formatInvoiceNumber(year, result.rows[0].lastNumber);
}

async function billingSnapshotFor(
  client: PoolClient,
  accountId: string,
): Promise<InvoiceBillingSnapshot | null> {
  const result = await client.query<InvoiceBillingSnapshot>(
    `SELECT billing_name AS "billingName", organisation_name AS "organisationName",
            address_line1 AS "addressLine1", address_line2 AS "addressLine2",
            city, province, postal_code AS "postalCode", country,
            billing_email AS "billingEmail", phone
     FROM account_billing_details
     WHERE account_id = $1`,
    [accountId],
  );
  return result.rows[0] ?? null;
}

/**
 * Create (or return the existing) PAID invoice for a successful PayFast
 * payment. Idempotent: concurrent/repeated calls for the same payment
 * reference return the same single invoice row.
 */
export async function createPaidInvoiceForPayment(input: CreateInvoiceInput): Promise<Invoice> {
  if (!input.payfastPaymentId.trim()) throw new Error("PayFast payment reference is required");
  if (!Number.isInteger(input.learnerQuantity) || input.learnerQuantity <= 0) {
    throw new Error("Invoice learner quantity must be a positive integer");
  }

  // Amounts always come from the central pricing configuration.
  const pricePerLearner = pricePerLearnerCents(input.planType);
  const subtotalCents = pricePerLearner * input.learnerQuantity;
  const vatCents = 0; // VAT not applicable
  const totalCents = subtotalCents + vatCents;
  if (input.amountCents !== totalCents) {
    throw new Error("Invoice amount does not match the central pricing configuration");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      `invoice:${input.payfastPaymentId}`,
    ]);

    // Duplicate ITN guard: if this payment was already invoiced, return the
    // existing invoice unchanged.
    const existing = await client.query<InvoiceRow>(
      `SELECT ${INVOICE_COLUMNS} FROM invoices WHERE payfast_payment_id = $1`,
      [input.payfastPaymentId],
    );
    if (existing.rows[0]) {
      await client.query("COMMIT");
      return toInvoice(existing.rows[0]);
    }

    const billingSnapshot = await billingSnapshotFor(client, input.accountId);
    const invoiceNumber = await nextInvoiceNumber(client);

    const inserted = await client.query<InvoiceRow>(
      `INSERT INTO invoices (
         account_id, invoice_number, payfast_payment_id, transaction_id, transaction_type,
         status, plan_type, learner_quantity, price_per_learner_cents, subtotal_cents,
         vat_cents, total_cents, currency, billing_snapshot,
         licence_period_start, licence_period_end
       ) VALUES (
         $1, $2, $3, $4, $5,
         'paid', $6, $7, $8, $9,
         $10, $11, 'ZAR', $12,
         $13, $14
       )
       RETURNING ${INVOICE_COLUMNS}`,
      [
        input.accountId,
        invoiceNumber,
        input.payfastPaymentId,
        input.transactionId,
        input.transactionType,
        input.planType,
        input.learnerQuantity,
        pricePerLearner,
        subtotalCents,
        vatCents,
        totalCents,
        JSON.stringify(billingSnapshot),
        input.licencePeriodStart,
        input.licencePeriodEnd,
      ],
    );

    await client.query("COMMIT");
    console.log("[invoice] issued", {
      invoiceNumber,
      accountId: input.accountId,
      payfastPaymentId: input.payfastPaymentId,
      transactionType: input.transactionType,
      totalCents,
    });
    return toInvoice(inserted.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function getAccountInvoices(accountId: string): Promise<InvoiceView[]> {
  const result = await pool.query<InvoiceRow>(
    `SELECT ${INVOICE_COLUMNS}
     FROM invoices
     WHERE account_id = $1
     ORDER BY invoice_date DESC, invoice_number DESC`,
    [accountId],
  );
  return result.rows.map(toInvoiceView);
}

export async function getAccountInvoice(accountId: string, invoiceId: string): Promise<Invoice | null> {
  const result = await pool.query<InvoiceRow>(
    `SELECT ${INVOICE_COLUMNS}
     FROM invoices
     WHERE account_id = $1 AND id = $2`,
    [accountId, invoiceId],
  );
  return result.rows[0] ? toInvoice(result.rows[0]) : null;
}
