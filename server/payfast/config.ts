export interface PayfastConfig {
  merchantId: string;
  merchantKey: string;
  passphrase: string;
  sandbox: boolean;
}

function readRequiredEnv(name: string): string | null {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : null;
}

const merchantId = readRequiredEnv("PAYFAST_MERCHANT_ID");
const merchantKey = readRequiredEnv("PAYFAST_MERCHANT_KEY");
const passphrase = readRequiredEnv("PAYFAST_PASSPHRASE");
const sandboxValue = readRequiredEnv("PAYFAST_SANDBOX");

const missingVariables = [
  !merchantId ? "PAYFAST_MERCHANT_ID" : null,
  !merchantKey ? "PAYFAST_MERCHANT_KEY" : null,
  !passphrase ? "PAYFAST_PASSPHRASE" : null,
  !sandboxValue ? "PAYFAST_SANDBOX" : null,
].filter((value): value is string => value !== null);

export const payfastConfig: PayfastConfig = {
  merchantId: merchantId ?? "",
  merchantKey: merchantKey ?? "",
  passphrase: passphrase ?? "",
  sandbox: sandboxValue === "true",
};

export function validatePayfastConfig() {
  if (missingVariables.length > 0) {
    console.warn(`[startup] PayFast configuration missing required environment variables: ${missingVariables.join(", ")}`);
  } else {
    console.log("[startup] PayFast configuration loaded");
  }
}
