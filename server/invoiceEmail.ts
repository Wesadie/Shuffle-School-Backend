import { pool } from "./db";
import { generateInvoicePdf } from "./invoicePdf";
import type { Invoice } from "@shared/schema";
import { invoiceDescription } from "@shared/invoices";
import { isLicensePlanType, licensePlanLabel } from "@shared/licence-pricing";

/**
 * Emails a PDF invoice through the existing Resend infrastructure.
 *
 * A database advisory lock plus emailed_at guard makes delivery idempotent:
 * duplicate/concurrent PayFast ITNs can never email the same invoice twice.
 */

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatZar(cents: number) {
  const rands = Math.floor(cents / 100);
  const remainder = String(cents % 100).padStart(2, "0");
  return `R ${String(rands).replace(/\B(?=(\d{3})+(?!\d))/g, " ")}.${remainder}`;
}

export async function sendInvoiceEmail(invoice: Invoice): Promise<{ sent: boolean; to: string | null }> {
  const to = invoice.billingSnapshot?.billingEmail?.trim() ?? null;
  if (!to) {
    console.warn("[invoice-email] no billing email on invoice — PDF not emailed", {
      invoiceNumber: invoice.invoiceNumber,
    });
    return { sent: false, to: null };
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[invoice-email] RESEND_API_KEY is not configured — PDF not emailed", {
      invoiceNumber: invoice.invoiceNumber,
    });
    return { sent: false, to };
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`invoice-email:${invoice.id}`]);
    const delivery = await client.query<{ emailedAt: Date | null }>(
      `SELECT emailed_at AS "emailedAt" FROM invoices WHERE id = $1 FOR UPDATE`,
      [invoice.id],
    );
    if (!delivery.rows[0]) throw new Error("Invoice no longer exists");
    if (delivery.rows[0].emailedAt) {
      await client.query("COMMIT");
      return { sent: false, to };
    }

    const pdfBytes = await generateInvoicePdf(invoice);
    const planLabel = isLicensePlanType(invoice.planType) ? licensePlanLabel(invoice.planType) : invoice.planType;
    const description = invoiceDescription(invoice.transactionType, planLabel, invoice.learnerQuantity);
    const amount = formatZar(invoice.totalCents);
    const appBaseUrl = (process.env.RENDER_EXTERNAL_URL ?? process.env.APP_BASE_URL ?? "https://shuffle-school.onrender.com").replace(/\/$/, "");

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "ShuffleSchool <notifications@shuffleschool.co.za>",
        to: [to],
        subject: `ShuffleSchool invoice ${invoice.invoiceNumber}`,
        html: `
          <div style="font-family:Arial,sans-serif;color:#1f2937;line-height:1.6;max-width:640px;margin:0 auto">
            <p>Hello${invoice.billingSnapshot?.billingName ? ` ${escapeHtml(invoice.billingSnapshot.billingName)}` : ""},</p>
            <p>Thank you for your payment. Your paid invoice is attached.</p>
            <table style="border-collapse:collapse;margin:20px 0" cellpadding="6">
              <tr><td style="color:#6b7280">Invoice number</td><td style="font-weight:700">${escapeHtml(invoice.invoiceNumber)}</td></tr>
              <tr><td style="color:#6b7280">Description</td><td>${escapeHtml(description)}</td></tr>
              <tr><td style="color:#6b7280">Total paid</td><td style="font-weight:700">${escapeHtml(amount)}</td></tr>
              <tr><td style="color:#6b7280">Payment reference</td><td>${escapeHtml(invoice.payfastPaymentId)}</td></tr>
            </table>
            <p>You can also download this invoice any time from
              <a href="${escapeHtml(appBaseUrl)}/settings/billing" style="color:#01858e">Licence &amp; Billing</a>.
            </p>
            <p style="color:#6b7280;font-size:12px">VAT: Not applicable.</p>
          </div>
        `,
        attachments: [
          {
            filename: `${invoice.invoiceNumber}.pdf`,
            content: Buffer.from(pdfBytes).toString("base64"),
          },
        ],
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Resend rejected the invoice email (${response.status}): ${body}`);
    }

    const result = (await response.json()) as { id: string };
    await client.query(`UPDATE invoices SET emailed_at = NOW(), updated_at = NOW() WHERE id = $1`, [invoice.id]);
    await client.query("COMMIT");
    console.log("[invoice-email] sent", {
      invoiceNumber: invoice.invoiceNumber,
      to,
      resendId: result.id,
    });
    return { sent: true, to };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
