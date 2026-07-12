/**
 * PayFast Instant Transaction Notification (ITN) handler.
 *
 * Official spec — "Instant Transaction Notifications (ITN)":
 *   https://developers.payfast.co.za/api#instant-transactions-notifications-itn
 *
 * Security checks performed (per official spec):
 *   1. Confirm merchant_id matches our configuration.
 *   2. Verify the MD5 signature against the received fields.
 *   3. Validate with PayFast server (POST to the validate endpoint).
 *   4. Confirm the payment amount matches the expected price.
 *
 * After validation, the appropriate licenceService function is called:
 *   initial  → activateInitialLicense
 *   topup    → addLearnerCapacity
 *   renewal  → renewLicense
 */

import type { Request, Response } from "express";
import { payfastConfig, PAYFAST_VALIDATE_URL, PRICE_PER_LEARNER_CENTS } from "./config";
import { verifySignature } from "./signature";
import {
  activateInitialLicense,
  addLearnerCapacity,
  renewLicense,
  type LicensePlanType,
  type PaymentTransactionType,
} from "../licenseService";

type ItnBody = Record<string, string>;

/** Coerce a raw POST body into a flat string map. */
function normalizeBody(body: unknown): ItnBody {
  if (!body || typeof body !== "object") return {};
  const result: ItnBody = {};
  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    if (typeof value === "string") {
      result[key] = value;
    } else if (value != null) {
      result[key] = String(value);
    }
  }
  return result;
}

/**
 * Confirm the notification with PayFast by POSTing the received fields
 * to the server-side validation endpoint.
 *
 * PayFast responds with the plain-text body "VALID" or "INVALID".
 */
async function validateWithPayfastServer(body: ItnBody): Promise<boolean> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(body)) {
    params.append(key, value);
  }

  const response = await fetch(PAYFAST_VALIDATE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  const text = (await response.text()).trim();
  console.log("[PayFast ITN Validation Response]", {
    paymentReference: body.m_payment_id,
    status: response.status,
    ok: response.ok,
    body: text,
  });
  return response.ok && text === "VALID";
}

function parseLearnerCount(body: ItnBody): number {
  const parsed = Number.parseInt(body.custom_int1 ?? "", 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error("Invalid learner count in ITN");
  }
  return parsed;
}

function parsePlanType(body: ItnBody): LicensePlanType {
  const value = body.custom_str1;
  if (value !== "teacher" && value !== "school") {
    throw new Error("Invalid plan type in ITN");
  }
  return value;
}

function parseTransactionType(body: ItnBody): PaymentTransactionType {
  const value = body.custom_str2;
  if (value === "topup" || value === "renewal") return value;
  return "initial";
}

/** Validate the gross amount against the expected learner × price calculation. */
function validateAmount(body: ItnBody, learnerCount: number): number {
  const gross = Number.parseFloat(body.amount_gross ?? body.amount ?? "");
  if (!Number.isFinite(gross) || gross < 0) {
    throw new Error("Invalid payment amount in ITN");
  }
  const amountCents = Math.round(gross * 100);
  const expectedCents = learnerCount * PRICE_PER_LEARNER_CENTS;
  if (amountCents !== expectedCents) {
    throw new Error("Payment amount mismatch in ITN");
  }
  return amountCents;
}

/**
 * Apply the licence operation for the given transaction type.
 * All functions are idempotent (guarded by an advisory lock keyed on payment reference).
 */
async function applyLicenseOperation(
  body: ItnBody,
  accountId: string,
  planType: LicensePlanType,
  transactionType: PaymentTransactionType,
  learnerCount: number,
  amountCents: number,
): Promise<void> {
  const paymentReference = body.m_payment_id;
  if (!paymentReference) throw new Error("Missing payment reference");

  if (transactionType === "topup") {
    await addLearnerCapacity(accountId, learnerCount, amountCents, paymentReference);
  } else if (transactionType === "renewal") {
    await renewLicense(accountId, amountCents, paymentReference);
  } else {
    await activateInitialLicense(accountId, planType, learnerCount, amountCents, paymentReference);
  }
}

export async function handlePayfastItn(req: Request, res: Response): Promise<void> {
  const body = normalizeBody(req.body);

  console.log("[PayFast ITN Received]", {
    paymentReference: body.m_payment_id,
    paymentStatus: body.payment_status,
    merchantId: body.merchant_id,
    amountGross: body.amount_gross,
    accountId: body.custom_str3,
    transactionType: body.custom_str2,
    learnerCount: body.custom_int1,
  });

  // --- Check 1: merchant identity ---
  if (body.merchant_id !== payfastConfig.merchantId) {
    console.warn("[PayFast ITN Rejected] invalid merchant", { paymentReference: body.m_payment_id });
    res.status(400).send("Invalid merchant");
    return;
  }

  // --- Check 2: signature ---
  if (!verifySignature(body, payfastConfig.passphrase, body.signature ?? "")) {
    console.warn("[PayFast ITN Rejected] invalid signature", { paymentReference: body.m_payment_id });
    res.status(400).send("Invalid signature");
    return;
  }

  // --- Check 3: server-side validation ---
  const isValid = await validateWithPayfastServer(body);
  if (!isValid) {
    console.warn("[PayFast ITN Rejected] server validation failed", { paymentReference: body.m_payment_id });
    res.status(400).send("PayFast validation failed");
    return;
  }

  // Non-complete payments are acknowledged but not processed.
  if (body.payment_status !== "COMPLETE") {
    console.log("[PayFast ITN Ignored] payment not complete", {
      paymentReference: body.m_payment_id,
      paymentStatus: body.payment_status,
    });
    res.status(200).send("OK");
    return;
  }

  try {
    const accountId = body.custom_str3;
    if (!accountId) throw new Error("Missing account identifier");

    const learnerCount = parseLearnerCount(body);
    const planType = parsePlanType(body);
    const transactionType = parseTransactionType(body);
    const amountCents = validateAmount(body, learnerCount);

    console.log("[PayFast ITN Parsed]", {
      paymentReference: body.m_payment_id,
      accountId,
      planType,
      transactionType,
      learnerCount,
      amountCents,
      amountGross: body.amount_gross,
    });

    await applyLicenseOperation(body, accountId, planType, transactionType, learnerCount, amountCents);

    console.log("[PayFast ITN Processed] licence updated", {
      paymentReference: body.m_payment_id,
      accountId,
      transactionType,
      learnerCount,
      amountCents,
    });

    res.status(200).send("OK");
  } catch (error) {
    console.error("[PayFast ITN Failed]", {
      message: error instanceof Error ? error.message : String(error),
      paymentReference: body.m_payment_id,
      receivedKeys: Object.keys(body),
      paymentStatus: body.payment_status,
      amountGross: body.amount_gross,
      accountId: body.custom_str3,
      transactionType: body.custom_str2,
      learnerCount: body.custom_int1,
    });
    // Return 400 so PayFast retries the ITN.
    res.status(400).send("Bad Request");
  }
}
