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
  const params = new URLSearchParams({
    merchant_id: payfastConfig.merchantId,
    merchant_key: payfastConfig.merchantKey,
    return_url: `${windowOrigin()}/payments/success`,
    cancel_url: `${windowOrigin()}/payments/cancel`,
    notify_url: `${windowOrigin()}/api/payments/payfast/itn`,
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

function windowOrigin() {
  return process.env.APP_BASE_URL ?? "";
}
