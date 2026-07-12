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
  return encodeURIComponent(value.trim())
    .replace(/%20/g, "+")
    .replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
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

  return calculateSignature(body).toLowerCase() === receivedSignature.toLowerCase();
}

async function validateWithPayfast(body: PayfastItnBody) {
  try {
    const validationUrl = payfastConfig.sandbox
      ? "https://sandbox.payfast.co.za/eng/query/validate"
      : "https://www.payfast.co.za/eng/query/validate";

    const payload = new URLSearchParams();
    for (const [key, value] of Object.entries(body)) {
      payload.append(key, value);
    }

    console.log("[PayFast Validation] Sending validation request", {
      url: validationUrl,
      payload: payload.toString(),
    });

    const response = await fetch(validationUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: payload.toString(),
    });

    console.log("[PayFast Validation] HTTP response", {
      status: response.status,
      ok: response.ok,
    });

    const text = (await response.text()).trim();
    console.log("[PayFast Validation] Response body", text);
    return response.ok && text === "VALID";
  } catch (error) {
    console.error("[PayFast Validation] Exception", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw error;
  }
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

function redactSensitiveItnFields(body: PayfastItnBody) {
  const redacted = { ...body };
  delete redacted.merchant_key;
  return redacted;
}

export async function handlePayfastItn(req: Request, res: Response) {
  try {
    try {
      const body = normalizeBody(req.body);
      console.log("[api/payments/payfast/itn] ITN received", {
        body: redactSensitiveItnFields(body),
        headers: req.headers,
      });
      console.log("[ITN STEP 1]");

    if (body.merchant_id !== payfastConfig.merchantId) {

      return res.status(400).send("Invalid merchant");
    }
    console.log("[ITN STEP 2]");

    if (!verifySignature(body)) {
      return res.status(400).send("Invalid signature");
    }
    console.log("[ITN STEP 3]");

    const validationResult = payfastConfig.sandbox
      ? true
      : await validateWithPayfast(body);
    console.log("[ITN Validation]", {
      payfastValidationPassed: validationResult,
    });
    if (!validationResult) {
      return res.status(400).send("Invalid PayFast validation");
    }
    console.log("[ITN STEP 4]");

    if (body.payment_status !== "COMPLETE") {
      return res.status(200).send("OK");
    }
    console.log("[ITN STEP 5]");

    const accountId = body.custom_str3;

    console.log("[api/payments/payfast/itn] temporary custom_str3 log", { custom_str3: accountId });
    const paymentReference = body.m_payment_id;
    if (!accountId) throw new Error("Missing account identifier");
    if (!paymentReference) throw new Error("Missing payment reference");

    const planType = requirePlanType(body.custom_str1);
    const learnerCount = requirePositiveInteger(body.custom_int1, "learner count");
    const amountCents = getAmountCents(body);
    const expectedAmountCents = learnerCount * 25 * 100;
    console.log("[ITN Amount Check]", {
      learnerCount,
      amountGross: body.amount_gross,
      parsedAmountCents: amountCents,
      expectedAmountCents,
      paymentReference,
    });
    if (amountCents !== expectedAmountCents) {
      throw new Error("Payment amount mismatch");
    }

    const transactionType = getTransactionType(body.custom_str2);

    if (transactionType === "topup") {
      console.log("[api/payments/payfast/itn] selected licence function", { functionName: "addLearnerCapacity", accountId });
      console.log("[api/payments/payfast/itn] entering addLearnerCapacity", { accountId });
      await addLearnerCapacity(accountId, learnerCount, amountCents, paymentReference);
    } else if (transactionType === "renewal") {
      console.log("[api/payments/payfast/itn] selected licence function", { functionName: "renewLicense", accountId });
      console.log("[api/payments/payfast/itn] entering renewLicense", { accountId });
      await renewLicense(accountId, amountCents, paymentReference);
    } else {
      console.log("[api/payments/payfast/itn] selected licence function", { functionName: "activateInitialLicense", accountId });
      console.log("[api/payments/payfast/itn] entering activateInitialLicense", { accountId });
      await activateInitialLicense(accountId, planType, learnerCount, amountCents, paymentReference);
    }

      return res.status(200).send("OK");
    } catch (error) {
      console.error("[api/payments/payfast/itn] failed to process notification", {
        error,
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      return res.status(400).send("Bad Request");
    }
  } catch (error) {
    console.error("[ITN FATAL ERROR]", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    return res.status(500).send("Internal Server Error");
  }
}
