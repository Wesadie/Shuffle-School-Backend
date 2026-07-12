/**
 * PayFast configuration — reads merchant credentials and mode from environment.
 *
 * Official spec references:
 *   https://developers.payfast.co.za/api#step-1-generate-a-payment-request
 *
 * Environment variables:
 *   PAYFAST_MERCHANT_ID   – your PayFast merchant ID
 *   PAYFAST_MERCHANT_KEY  – your PayFast merchant key
 *   PAYFAST_PASSPHRASE    – passphrase set in your PayFast dashboard (used for signatures)
 *   PAYFAST_SANDBOX       – "true" to use the sandbox environment
 *   APP_BASE_URL          – public HTTPS base URL for return/cancel/notify callbacks
 */

export interface PayfastConfig {
  merchantId: string;
  merchantKey: string;
  passphrase: string;
  sandbox: boolean;
}

function readEnv(name: string): string {
  return (process.env[name] ?? "").trim();
}

const merchantId = readEnv("PAYFAST_MERCHANT_ID");
const merchantKey = readEnv("PAYFAST_MERCHANT_KEY");
const passphrase = readEnv("PAYFAST_PASSPHRASE");
const sandbox = readEnv("PAYFAST_SANDBOX").toLowerCase() === "true";

export const payfastConfig: PayfastConfig = {
  merchantId,
  merchantKey,
  passphrase,
  sandbox,
};

/** Process (checkout) endpoint — user browser is redirected here. */
export const PAYFAST_PROCESS_URL = sandbox
  ? "https://sandbox.payfast.co.za/eng/process"
  : "https://www.payfast.co.za/eng/process";

/** Validate endpoint — server-to-server ITN confirmation. */
export const PAYFAST_VALIDATE_URL = sandbox
  ? "https://sandbox.payfast.co.za/eng/query/validate"
  : "https://www.payfast.co.za/eng/query/validate";

/**
 * The public HTTPS base URL for callback endpoints.
 * PayFast requires absolute HTTPS URLs for return_url, cancel_url and notify_url.
 */
export function getPublicBaseUrl(): string {
  const raw = readEnv("APP_BASE_URL");
  if (!raw) {
    throw new Error("APP_BASE_URL is required for PayFast callbacks");
  }
  const url = new URL(raw);
  if (url.protocol !== "https:") {
    throw new Error("APP_BASE_URL must use HTTPS for PayFast callbacks");
  }
  return url.origin;
}

/** Price per learner in cents (R25.00 = 2500 cents). */
export const PRICE_PER_LEARNER_CENTS = 2500;

/** Warn at startup if critical configuration is missing. */
export function warnOnMissingConfig(): void {
  const missing: string[] = [];
  if (!merchantId) missing.push("PAYFAST_MERCHANT_ID");
  if (!merchantKey) missing.push("PAYFAST_MERCHANT_KEY");
  if (!passphrase) missing.push("PAYFAST_PASSPHRASE");
  if (missing.length > 0) {
    console.warn(
      `[startup] PayFast is missing required environment variables: ${missing.join(", ")}`,
    );
  }
}
