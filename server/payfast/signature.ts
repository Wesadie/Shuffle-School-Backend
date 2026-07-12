/**
 * PayFast signature generation and verification.
 *
 * Official spec — "How to generate a signature":
 *   https://developers.payfast.co.za/api#step-1-generate-a-payment-request
 *
 * The signature is an MD5 hash of a parameter string built as follows:
 *   1. Take every non-empty field (excluding `signature` itself).
 *   2. Sort the fields alphabetically by parameter name.
 *   3. URL-encode each value using PHP-compatible urlencode semantics.
 *   4. Concatenate as name=value&name=value …
 *   5. Append &passphrase=<passphrase> when a passphrase is set.
 *   6. MD5 hash the result.
 *
 * PayFast's server uses PHP's `urlencode()`, which differs from JavaScript's
 * `encodeURIComponent()` for a handful of characters, so we normalise them.
 */

import crypto from "crypto";

/**
 * Encode a value to match PHP's `urlencode()` output exactly.
 *
 * Differences from `encodeURIComponent`:
 *   - Spaces become `+` (not `%20`)
 *   - `! ' ( ) * ~` are percent-encoded (encodeURIComponent leaves them raw)
 */
export function payfastUrlEncode(value: string): string {
  return encodeURIComponent(value.trim())
    .replace(/%20/g, "+")
    .replace(/[!'()*~]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

/**
 * Build the canonical parameter string used to generate or verify a signature.
 */
export function buildParamString(
  fields: Record<string, string>,
  passphrase: string,
): string {
  const sorted = Object.entries(fields)
    .filter(([key, value]) => key !== "signature" && value !== "")
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

  let paramStr = sorted
    .map(([key, value]) => `${key}=${payfastUrlEncode(value)}`)
    .join("&");

  if (passphrase) {
    paramStr += `${paramStr ? "&" : ""}passphrase=${payfastUrlEncode(passphrase)}`;
  }

  return paramStr;
}

/** Generate an MD5 signature from a set of fields. */
export function generateSignature(
  fields: Record<string, string>,
  passphrase: string,
): string {
  return crypto.createHash("md5").update(buildParamString(fields, passphrase)).digest("hex");
}

/**
 * Verify that a received signature matches the expected signature.
 *
 * Uses `timingSafeEqual` to guard against timing-based attacks.
 */
export function verifySignature(
  fields: Record<string, string>,
  passphrase: string,
  receivedSignature: string,
): boolean {
  if (!receivedSignature) return false;
  const expected = generateSignature(fields, passphrase);
  if (expected.length !== receivedSignature.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(receivedSignature));
  } catch {
    return false;
  }
}
