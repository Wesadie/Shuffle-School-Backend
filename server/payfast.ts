import crypto from "crypto";
import { nanoid } from "nanoid";
import type { LicensePlanType } from "./licenseService";

const PAYFAST_MERCHANT_ID = process.env.PAYFAST_MERCHANT_ID ?? "";
const PAYFAST_MERCHANT_KEY = process.env.PAYFAST_MERCHANT_KEY ?? "";
const PAYFAST_PASSPHRASE = process.env.PAYFAST_PASSPHRASE ?? "";
const PAYFAST_PAYMENT_URL = process.env.PAYFAST_PAYMENT_URL ?? "https://www.payfast.co.za/eng/process";
const APP_BASE_URL = process.env.APP_BASE_URL ?? "";

function assertValidPlanType(planType: string): asserts planType is LicensePlanType {
  if (planType !== "teacher" && planType !== "school") {
    throw new Error("planType must be teacher or school");
  }
}

function assertPositiveInteger(value: number, name: string) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
}

function buildSignature(fields: Record<string, string>) {
  const entries = Object.entries(fields)
    .filter(([, value]) => value !== "")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${encodeURIComponent(value).replace(/%20/g, "+")}`)
    .join("&");

  const signed = PAYFAST_PASSPHRASE ? `${entries}&passphrase=${encodeURIComponent(PAYFAST_PASSPHRASE).replace(/%20/g, "+")}` : entries;
  return crypto.createHash("md5").update(signed).digest("hex");
}

export function buildPayfastInitiationUrl(planType: string, learnerCount: number) {
  assertValidPlanType(planType);
  assertPositiveInteger(learnerCount, "learnerCount");

  const amount = learnerCount * 25;
  const amountFormatted = amount.toFixed(2);
  const paymentReference = `SSF-${nanoid(12).toUpperCase()}`;
  const merchantName = "ShuffleSchool";
  const description = `${planType === "teacher" ? "Teacher" : "School"} licence for ${learnerCount} learner${learnerCount === 1 ? "" : "s"}`;

  const fields = {
    merchant_id: PAYFAST_MERCHANT_ID,
    merchant_key: PAYFAST_MERCHANT_KEY,
    return_url: `${APP_BASE_URL}/payments/success`,
    cancel_url: `${APP_BASE_URL}/payments/cancel`,
    notify_url: `${APP_BASE_URL}/api/payments/payfast/notify`,
    name_first: merchantName,
    name_last: "",
    email_address: "",
    m_payment_id: paymentReference,
    amount: amountFormatted,
    item_name: description,
    item_description: description,
    custom_str1: planType,
    custom_int1: String(learnerCount),
  };

  const signature = buildSignature(fields);
  const url = new URL(PAYFAST_PAYMENT_URL);
  for (const [key, value] of Object.entries(fields)) {
    if (value !== "") {
      url.searchParams.set(key, value);
    }
  }
  url.searchParams.set("signature", signature);

  return {
    paymentReference,
    amount,
    amountFormatted,
    redirectUrl: url.toString(),
  };
}
