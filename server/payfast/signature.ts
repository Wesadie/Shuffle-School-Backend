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
 *
 * This encoding function is used for BOTH the signature parameter string AND
 * the redirect URL query parameters — they MUST be identical so that PayFast's
 * server, which decodes the URL then re-encodes with PHP urlencode(), produces
 * the exact same parameter string we hashed.
 */

import crypto from "crypto";

/**
 * Encode a value to match PHP's `urlencode()` output exactly.
 *
 * PHP urlencode() leaves only [A-Za-z0-9-_.] unencoded and converts spaces to +.
 * JavaScript's encodeURIComponent() additionally leaves !'()*~ unencoded, so we
 * percent-encode those to bridge the gap.
 */
export function payfastUrlEncode(value: string): string {
  return encodeURIComponent(value.trim())
    .replace(/%20/g, "+")
    .replace(/[!'()*~]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

/**
 * Build the canonical parameter string used to generate or verify a signature.
 * Used for BOTH signature generation and redirect-URL construction.
 *
 * Does NOT include the passphrase — callers append it separately for signatures.
 */
export function buildEncodedParamString(
  fields: Record<string, string>,
  options: { sort?: boolean } = {},
): string {
  const entries = Object.entries(fields)
    .filter(([key, value]) => key !== "signature" && value !== "");

  if (options.sort) {
    entries.sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
  }

  return entries
    .map(([key, value]) => `${key}=${payfastUrlEncode(value)}`)
    .join("&");
}

/** Generate an MD5 signature from a set of fields and passphrase. */
export function generateSignature(
  fields: Record<string, string>,
  passphrase: string,
  options: { sort?: boolean } = {},
): string {
  let paramStr = buildEncodedParamString(fields, options);
  if (passphrase) {
    paramStr += `${paramStr ? "&" : ""}passphrase=${payfastUrlEncode(passphrase)}`;
  }
  return crypto.createHash("md5").update(paramStr).digest("hex");
}

function safelyCompareSignatures(expected: string, received: string): boolean {
  if (expected.length !== received.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(received));
  } catch {
    return false;
  }
}

function md5(value: string): string {
  return crypto.createHash("md5").update(value).digest("hex");
}

function stripSignatureFromRawForm(rawBody: string): string | null {
  const parts = rawBody.split("&");
  const signatureIndex = parts.findIndex((part) => part.split("=", 1)[0] === "signature");
  if (signatureIndex === -1) return null;

  parts.splice(signatureIndex, 1);
  return parts.filter(Boolean).join("&");
}

/**
 * Verify that a received signature matches the expected signature.
 *
 * Initiation signatures in this app intentionally preserve PayFast's sample field
 * order, but ITN payloads are verified using the raw received form payload first
 * because PayFast signs the exact ordered urlencoded data it posts to us.
 */
export function verifySignature(
  fields: Record<string, string>,
  passphrase: string,
  receivedSignature: string,
  rawBody?: string,
): boolean {
  if (!receivedSignature) return false;

  const variants: string[] = [];
  const rawWithoutSignature = rawBody ? stripSignatureFromRawForm(rawBody) : null;

  if (rawWithoutSignature) {
    variants.push(md5(`${rawWithoutSignature}&passphrase=${payfastUrlEncode(passphrase)}`));
    variants.push(md5(rawWithoutSignature));
  }

  variants.push(
    generateSignature(fields, passphrase),
    generateSignature(fields, passphrase, { sort: true }),
    generateSignature(fields, ""),
    generateSignature(fields, "", { sort: true }),
  );

  return variants.some((expected) => safelyCompareSignatures(expected, receivedSignature));
}
