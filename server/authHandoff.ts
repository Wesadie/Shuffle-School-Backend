import type { RequestHandler } from "express";
import { randomUUID } from "crypto";
import { pool } from "./db";
import { seedDemoData } from "./demoSeed";
import { ensureOnboardingAccount } from "./onboarding";

const HANDOFF_TTL_SECONDS = 120;
export const FRONTEND_ORIGIN = (process.env.FRONTEND_URL ?? "https://shuffleschool.co.za").replace(/\/$/, "");

export function authHandoffRedirectUrl(code: string): string {
  const url = new URL("/auth/handoff", FRONTEND_ORIGIN);
  url.searchParams.set("code", code);
  return url.toString();
}

/**
 * Creates a short-lived, single-use handoff code.
 * Called by the Lovable frontend after registration or sign-in.
 * The frontend sends its Supabase refresh_token in the body and receives the
 * canonical Lovable handoff URL in the response.
 *
 * Security:

 * - Requires a valid Supabase access token (requireSupabaseUser middleware).
 * - Code is a cryptographically random UUID (122 bits of entropy).
 * - Expires in 120 seconds.
 * - Single-use: marked consumed on exchange, row deleted.
 * - Tokens never appear in URLs.
 */
export const createAuthHandoff: RequestHandler = async (req, res) => {
  if (!req.supabaseUser) {
    console.warn("[authHandoff] create rejected: missing Supabase user");
    return res.status(401).json({ message: "Authenticated Supabase user required" });
  }

  const refreshToken =
    typeof req.body?.refresh_token === "string" ? req.body.refresh_token : null;
  const accessToken =
    req.header("authorization")?.replace(/^Bearer\s+/i, "") ?? null;

  console.log("[authHandoff] create entered", {
    userId: req.supabaseUser.id,
    hasAccessToken: Boolean(accessToken),
    hasRefreshToken: Boolean(refreshToken),
  });

  if (!accessToken || !refreshToken) {
    return res.status(400).json({ message: "Access token and refresh token are required" });
  }

  try {
    const account = await ensureOnboardingAccount(req.supabaseUser);
    if (account.isNewAccount) {
      await seedDemoData(account.accountId);
    }
    console.log("[authHandoff] onboarding ensured", {
      userId: req.supabaseUser.id,
      accountId: account.accountId,
      isNewAccount: account.isNewAccount,
      subscriptionStatus: account.subscriptionStatus,
    });
  } catch (error) {
    console.error("[authHandoff] failed to ensure onboarding", {
      userId: req.supabaseUser.id,
      message: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({ message: "Failed to start trial workspace" });
  }

  const code = randomUUID();
  const expiresAt = new Date(Date.now() + HANDOFF_TTL_SECONDS * 1000);

  let client;
  try {
    client = await pool.connect();
  } catch (error) {
    console.error("[authHandoff] failed to acquire DB connection", {
      message: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({ message: "Failed to create auth handoff" });
  }

  try {
    // Clean up expired handoffs opportunistically
    await client.query("DELETE FROM auth_handoffs WHERE expires_at < NOW()");

    await client.query(

      `INSERT INTO auth_handoffs (code, user_id, access_token, refresh_token, expires_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [code, req.supabaseUser.id, accessToken, refreshToken, expiresAt],
    );

    console.log("[authHandoff] create inserted handoff", {
      userId: req.supabaseUser.id,
      expiresAt: expiresAt.toISOString(),
    });
  } catch (error) {
    console.error("[authHandoff] failed to create handoff", {
      message: error instanceof Error ? error.message : String(error),
      code: typeof error === "object" && error !== null && "code" in error ? String(error.code) : undefined,
    });
    return res.status(500).json({ message: "Failed to create auth handoff" });
  } finally {
    client.release();
  }

  return res.status(200).json({
    code,
    redirectUrl: authHandoffRedirectUrl(code),
  });
};

/**
 * Exchanges a handoff code for the Supabase tokens needed to call setSession().
 * Called by the Lovable frontend's /auth/handoff page.
 *
 * The code is single-use: once consumed the row is deleted.
 * Tokens are returned in the HTTPS response body (never in a URL).
 */
export const exchangeAuthHandoff: RequestHandler = async (req, res) => {
  const code =
    typeof req.body?.code === "string" ? req.body.code.trim() : null;

  if (!code) {
    return res.status(400).json({ message: "Handoff code is required" });
  }

  let client;
  try {
    client = await pool.connect();
  } catch {
    return res.status(500).json({ message: "Failed to exchange handoff code" });
  }

  try {
    // Atomically claim the row: only succeed if not used and not expired.
    const result = await client.query(
      `DELETE FROM auth_handoffs
       WHERE code = $1 AND used = FALSE AND expires_at > NOW()
       RETURNING access_token, refresh_token, user_id`,
      [code],
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ message: "Invalid or expired handoff code" });
    }

    const row = result.rows[0];

    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({
      access_token: row.access_token,
      refresh_token: row.refresh_token,
    });
  } catch (error) {
    console.error("[authHandoff] failed to exchange handoff", {
      message: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({ message: "Failed to exchange handoff code" });
  } finally {
    client.release();
  }
};
