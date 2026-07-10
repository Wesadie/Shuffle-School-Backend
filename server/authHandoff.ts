import type { RequestHandler } from "express";
import { randomUUID } from "crypto";
import { pool } from "./db";

const HANDOFF_TTL_SECONDS = 120;

/**
 * Creates a short-lived, single-use handoff code.
 * Called by the Lovable marketing site AFTER successful onboarding.
 * The Lovable frontend sends its Supabase refresh_token in the body so the
 * Render app can establish a browser session on its own domain via setSession().
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
    return res.status(401).json({ message: "Authenticated Supabase user required" });
  }

  const refreshToken =
    typeof req.body?.refresh_token === "string" ? req.body.refresh_token : null;
  const accessToken =
    req.header("authorization")?.replace(/^Bearer\s+/i, "") ?? null;

  if (!accessToken || !refreshToken) {
    return res.status(400).json({ message: "Access token and refresh token are required" });
  }

  const code = randomUUID();
  const expiresAt = new Date(Date.now() + HANDOFF_TTL_SECONDS * 1000);

  const client = await pool.connect();
  try {
    // Clean up expired handoffs opportunistically
    await client.query("DELETE FROM auth_handoffs WHERE expires_at < NOW()");

    await client.query(
      `INSERT INTO auth_handoffs (code, user_id, access_token, refresh_token, expires_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [code, req.supabaseUser.id, accessToken, refreshToken, expiresAt],
    );
  } catch (error) {
    console.error("[authHandoff] failed to create handoff", {
      message: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({ message: "Failed to create auth handoff" });
  } finally {
    client.release();
  }

  res.status(201).json({ code });
};

/**
 * Exchanges a handoff code for the Supabase tokens needed to call setSession().
 * Called by the Render frontend's /auth/handoff page.
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

  const client = await pool.connect();
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
