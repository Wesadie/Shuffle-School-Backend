import type { IncomingMessage, ServerResponse } from "http";

/**
 * Shared CORS utilities for Vercel serverless functions.
 *
 * The Express app already has its own CORS middleware, but these helpers
 * run at the Vercel function boundary — *before* the Express app is loaded —
 * so that OPTIONS preflight requests and cold-start error responses always
 * include CORS headers even when Express initialisation fails.
 */

function isCorsAllowedOrigin(origin: string): boolean {
  const extraOrigins = (process.env.CORS_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

  if (extraOrigins.includes(origin)) return true;

  try {
    const hostname = new URL(origin).hostname;
    return (
      hostname.endsWith(".lovable.app") ||
      hostname.endsWith("shuffleschool.co.za")
    );
  } catch {
    return false;
  }
}

/**
 * Sets CORS response headers when the request origin is allowed.
 * Returns true if headers were applied.
 */
export function applyCorsHeaders(
  req: IncomingMessage,
  res: ServerResponse,
): boolean {
  const origin = req.headers.origin;
  if (!origin || !isCorsAllowedOrigin(origin)) return false;

  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, PATCH, PUT, DELETE, OPTIONS",
  );
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Max-Age", "86400");
  return true;
}

/** Returns true for CORS preflight (OPTIONS) requests. */
export function isPreflightRequest(req: IncomingMessage): boolean {
  return req.method === "OPTIONS";
}
