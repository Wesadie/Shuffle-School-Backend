import crypto from "crypto";
import type { Request, Response } from "express";
import { payfastConfig } from "./config";
import {
  activateInitialLicense,
  addLearnerCapacity,
  renewLicense,
  type LicensePlanType,
  type PaymentTransactionType,
} from "../licenseService";

type PayfastItnBody = Record<string, string>;

function normalizeBody(body: unknown): PayfastItnBody {
  if (!body || typeof body !== "object") return {};

  const normalized: PayfastItnBody = {};
  for (const [key, value] of Object.entries(body)) {
    if (typeof value === "string") {
      normalized[key] = value;
    } else if (value != null) {
      normalized[key] = String(value);
    }
  }
  return normalized;
}

function encodePayfastValue(value: string) {
  return encodeURIComponent(value.trim()).replace(/%20/g, "+");
}

function buildSignaturePayload(body: PayfastItnBody) {
  const payload = Object.entries(body)
    .filter(([key, value]) => key !== "signature" && value !== "")
    .map(([key, value]) => `${key}=${encodePayfastValue(value)}`)
    .join("&");

  if (!payfastConfig.passphrase) return payload;
  return `${payload}&passphrase=${encodePayfastValue(payfastConfig.passphrase)}`;
}

function calculateSignature(body: PayfastItnBody) {
  return crypto.createHash("md5").update(buildSignaturePayload(body)).digest("hex");
}

function verifySignature(body: PayfastItnBody) {
  const receivedSignature = body.signature;
  if (!receivedSignature) return false;

  const expectedSignature = calculateSignature(body);
  return expectedSignature.toLowerCase() === receivedSignature.toLowerCase();
}

async function validateWithPayfast(body: PayfastItnBody) {
  const validationUrl = payfastConfig.sandbox
    ? "https://sandbox.payfast.co.za/eng/query/validate"
    : "https://www.payfast.co.za/eng/query/validate";

  const payload = new URLSearchParams();
  for (const [key, value] of Object.entries(body)) {
    payload.append(key, value);
  }

  const response = await fetch(validationUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: payload.toString(),
  });

  const text = (await response.text()).trim();
  return response.ok && text === "VALID";
}

function logItnDiagnostics(
  body: PayfastItnBody,
  diagnostics: {
    merchantIdMatched: boolean;
    signaturePassed: boolean;
    calculatedSignature: string;
    payfastServerValidationPassed: boolean | null;
    rejectionReason: string;
  },
) {
  console.warn("[api/payments/payfast/itn] temporary diagnostic rejection log", {
    paymentStatus: body.payment_status,
    merchantIdMatched: diagnostics.merchantIdMatched,
    signaturePassed: diagnostics.signaturePassed,
    receivedSignature: body.signature,
    calculatedSignature: diagnostics.calculatedSignature,
    payfastServerValidationPassed: diagnostics.payfastServerValidationPassed,
    rejectionReason: diagnostics.rejectionReason,
  });
}

function requirePlanType(value: string | undefined): LicensePlanType {
  if (value !== "teacher" && value !== "school") {
    throw new Error("Invalid plan type");
  }
  return value;
}

function getTransactionType(value: string | undefined): PaymentTransactionType {
  if (value === "topup" || value === "renewal") return value;
  return "initial";
}

function requirePositiveInteger(value: string | undefined, name: string) {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid ${name}`);
  }
  return parsed;
}

function getAmountCents(body: PayfastItnBody) {
  const amount = Number.parseFloat(body.amount_gross ?? body.amount ?? "");
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error("Invalid payment amount");
  }
  return Math.round(amount * 100);
}

export async function handlePayfastItn(req: Request, res: Response) {
  const body = normalizeBody(req.body);
  const merchantIdMatched = body.merchant_id === payfastConfig.merchantId;
  const calculatedSignature = calculateSignature(body);
  const signaturePassed = verifySignature(body);
  let payfastServerValidationPassed: boolean | null = null;

  try {
    if (!merchantIdMatched) {
      logItnDiagnostics(body, {
        merchantIdMatched,
        signaturePassed,
        calculatedSignature,
        payfastServerValidationPassed,
        rejectionReason: "Invalid merchant",
      });
      return res.status(400).send("Invalid merchant");
    }

    if (!signaturePassed) {
      logItnDiagnostics(body, {
        merchantIdMatched,
        signaturePassed,
        calculatedSignature,
        payfastServerValidationPassed,
        rejectionReason: "Invalid signature",
      });
      return res.status(400).send("Invalid signature");
    }

    payfastServerValidationPassed = await validateWithPayfast(body);
    if (!payfastServerValidationPassed) {
      logItnDiagnostics(body, {
        merchantIdMatched,
        signaturePassed,
        calculatedSignature,
        payfastServerValidationPassed,
        rejectionReason: "Invalid PayFast validation",
      });
      return res.status(400).send("Invalid PayFast validation");
    }

    if (body.payment_status !== "COMPLETE") {
      return res.status(200).send("OK");
    }

    const accountId = body.custom_str3;
    const paymentReference = body.m_payment_id;
    if (!accountId) throw new Error("Missing account identifier");
    if (!paymentReference) throw new Error("Missing payment reference");

    const planType = requirePlanType(body.custom_str1);
    const learnerCount = requirePositiveInteger(body.custom_int1, "learner count");
    const amountCents = getAmountCents(body);
    const expectedAmountCents = learnerCount * 25 * 100;
    if (amountCents !== expectedAmountCents) {
      throw new Error("Payment amount mismatch");
    }

    const transactionType = getTransactionType(body.custom_str2);
    if (transactionType === "topup") {
      await addLearnerCapacity(accountId, learnerCount, amountCents, paymentReference);
    } else if (transactionType === "renewal") {
      await renewLicense(accountId, amountCents, paymentReference);
    } else {
      await activateInitialLicense(accountId, planType, learnerCount, amountCents, paymentReference);
    }

    return res.status(200).send("OK");
  } catch (error) {
    const rejectionReason = error instanceof Error ? error.message : String(error);
    logItnDiagnostics(body, {
      merchantIdMatched,
      signaturePassed,
      calculatedSignature,
      payfastServerValidationPassed,
      rejectionReason,
    });
    console.error("[api/payments/payfast/itn] failed to process notification", {
      message: rejectionReason,
    });
    return res.status(400).send("Bad Request");
  }
}
