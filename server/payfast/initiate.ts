/**
 * PayFast payment initiation.
 *
 * Official spec — "Custom Integration (Redirect)":
 *   https://developers.payfast.co.za/api#step-1-generate-a-payment-request
 *
 * Flow:
 *   1. Build the required and optional form fields.
 *   2. Generate the MD5 security signature.
 *   3. Return a redirect URL that the browser navigates to.
 *   4. PayFast hosts the payment page and sends the ITN to our notify_url.
 *
 * CRITICAL: The query-string values in the redirect URL are encoded with the
 * exact same payfastUrlEncode function used to compute the signature. This
 * ensures PayFast's server — which decodes the URL then re-encodes with PHP
 * urlencode() — reconstructs the identical parameter string we hashed.
 */

import { randomUUID } from "crypto";
import {
  payfastConfig,
  PAYFAST_PROCESS_URL,
  getPublicBaseUrl,
  PRICE_PER_LEARNER_CENTS,
} from "./config";
import {
  generateSignature,
  buildEncodedParamString,
} from "./signature";

export interface PayfastInitiationInput {
  planType: "teacher" | "school";
  transactionType: "initial" | "topup" | "renewal";
  accountId: string;
  learnerCount: number;
}

export interface PayfastInitiationResult {
  paymentId: string;
  amountCents: number;
  redirectUrl: string;
}

/**
 * Build the PayFast redirect URL for a new payment.
 *
 * Custom pass-through fields (returned unchanged in the ITN):
 *   custom_str1  – plan type ("teacher" | "school")
 *   custom_str2  – transaction type ("initial" | "topup" | "renewal")
 *   custom_str3  – account ID (UUID)
 *   custom_int1  – learner quantity
 */
export function buildPayfastPaymentUrl(input: PayfastInitiationInput): PayfastInitiationResult {
  const { planType, transactionType, accountId, learnerCount } = input;

  if (!accountId.trim()) throw new Error("accountId is required");
  if (!Number.isInteger(learnerCount) || learnerCount <= 0) {
    throw new Error("learnerCount must be a positive integer");
  }

  const amountCents = learnerCount * PRICE_PER_LEARNER_CENTS;
  const amount = (amountCents / 100).toFixed(2);
  const paymentId = `SSF-${randomUUID()}`;
  const baseUrl = getPublicBaseUrl();
  const itemName = `${planType === "teacher" ? "Teacher" : "School"} licence - ${learnerCount} learner${learnerCount === 1 ? "" : "s"}`;

  const fields: Record<string, string> = {
    merchant_id: payfastConfig.merchantId,
    merchant_key: payfastConfig.merchantKey,
    return_url: `${baseUrl}/payments/success`,
    cancel_url: `${baseUrl}/payments/cancel`,
    notify_url: `${baseUrl}/api/payments/payfast/itn`,
    m_payment_id: paymentId,
    amount,
    item_name: itemName,
    custom_str1: planType,
    custom_str2: transactionType,
    custom_str3: accountId,
    custom_int1: String(learnerCount),
  };

  const signature = generateSignature(fields, payfastConfig.passphrase);

  // Build the URL query string with the SAME encoding used for the signature.
  // This guarantees the values PayFast receives match exactly what we hashed.
  const queryString = buildEncodedParamString(fields);
  const redirectUrl = `${PAYFAST_PROCESS_URL}?${queryString}&signature=${signature}`;

  console.log("[PayFast Initiation Fields]", {
    order: Object.keys(fields),
    processUrl: PAYFAST_PROCESS_URL,
    merchantId: payfastConfig.merchantId,
    hasMerchantKey: Boolean(payfastConfig.merchantKey),
    hasPassphrase: Boolean(payfastConfig.passphrase),
    amount,
    paymentId,
  });

  return { paymentId, amountCents, redirectUrl };
}
