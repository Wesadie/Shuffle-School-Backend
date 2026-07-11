import { randomUUID } from "crypto";
import { payfastConfig } from "./config";

export interface PayfastInitiationInput {
  planType: "teacher" | "school";
  learnerCount: number;
}

export function buildPayfastSandboxRedirectUrl({ planType, learnerCount }: PayfastInitiationInput) {
  if (!payfastConfig.sandbox) {
    throw new Error("PayFast sandbox mode is not enabled");
  }

  if (planType !== "teacher" && planType !== "school") {
    throw new Error("planType must be teacher or school");
  }

  if (!Number.isInteger(learnerCount) || learnerCount <= 0) {
    throw new Error("learnerCount must be a positive integer");
  }

  const amount = learnerCount * 25;
  const merchantPaymentId = `SSF-${randomUUID()}`;
  const itemName = `${planType === "teacher" ? "Teacher" : "School"} licence for ${learnerCount} learner${learnerCount === 1 ? "" : "s"}`;
  const publicBaseUrl = getPublicBaseUrl();
  const params = new URLSearchParams({
    merchant_id: payfastConfig.merchantId,
    merchant_key: payfastConfig.merchantKey,
    return_url: `${publicBaseUrl}/payments/success`,
    cancel_url: `${publicBaseUrl}/payments/cancel`,
    notify_url: `${publicBaseUrl}/api/payments/payfast/itn`,
    name_first: "ShuffleSchool",
    m_payment_id: merchantPaymentId,
    amount: amount.toFixed(2),
    item_name: itemName,
    item_description: itemName,
    custom_str1: planType,
    custom_int1: String(learnerCount),
  });

  return {
    amount,
    merchantPaymentId,
    redirectUrl: `${getPayfastBaseUrl()}/eng/process?${params.toString()}`,
  };
}

function getPayfastBaseUrl() {
  return payfastConfig.sandbox ? "https://sandbox.payfast.co.za" : "https://www.payfast.co.za";
}

function getPublicBaseUrl() {
  const publicBaseUrl = (process.env.APP_BASE_URL ?? "https://shuffle-school.onrender.com").trim().replace(/\/$/, "");
  const url = new URL(publicBaseUrl);
  if (url.protocol !== "https:") {
    throw new Error("APP_BASE_URL must be an absolute HTTPS URL for PayFast callbacks");
  }
  return url.origin;
}
