import type { RequestHandler } from "express";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import { pool } from "./db";
import type { AccountContext } from "./accountContext";

const SUPABASE_URL = process.env.SUPABASE_URL ?? "https://xhtyynajsnnuxfvfqghg.supabase.co";
const SUPABASE_KEY_FALLBACK =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhodHl5bmFqc25udXhmdmZxZ2hnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM0Mjc1NDgsImV4cCI6MjA5OTAwMzU0OH0.5mE-xJlm_Dx8CYdAamFEUMczd_jS0wCpgPjAtBZjNAQ";

// Tracks which env var supplied the Supabase key for diagnostics (never logs the value).
function resolveSupabaseKey(): {
  key: string;
  source: "SUPABASE_ANON_KEY" | "SUPABASE_PUBLISHABLE_KEY" | "fallback";
} {
  if (process.env.SUPABASE_ANON_KEY != null)
    return { key: process.env.SUPABASE_ANON_KEY, source: "SUPABASE_ANON_KEY" };
  if (process.env.SUPABASE_PUBLISHABLE_KEY != null)
    return { key: process.env.SUPABASE_PUBLISHABLE_KEY, source: "SUPABASE_PUBLISHABLE_KEY" };
  return { key: SUPABASE_KEY_FALLBACK, source: "fallback" };
}

const { key: SUPABASE_PUBLISHABLE_KEY, source: SUPABASE_KEY_SOURCE } = resolveSupabaseKey();

const AUTH_API_BASE = `${SUPABASE_URL.replace(/\/$/, "")}/auth/v1`;

declare global {
  namespace Express {
    interface Request {
      supabaseUser?: SupabaseUser;
      supabaseAccountContext?: AccountContext;
      // Fresh session minted server-side from a caller's refresh token, set
      // when a signup/onboarding call arrived with a stale or rejected
      // access token. Consumers should prefer these tokens.
      supabaseRefreshedSession?: {
        access_token: string;
        refresh_token: string;
        user: SupabaseUser;
      };
    }
  }
}

function bearerTokenFrom(req: Parameters<RequestHandler>[0]): string | undefined {
  const authHeader = req.header("authorization");
  if (!authHeader) return undefined;
  const [scheme, token] = authHeader.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return undefined;
  return token;
}

/**
 * Validate a Supabase access token directly against the Supabase Auth API.
 *
 * This performs the same request supabase-js makes internally for
 * getUser(jwt), but without any dependency on the client library's session
 * state. The server build externalizes @supabase/supabase-js, so the
 * production install resolves the version at deploy time — and that release
 * routes getUser() through its (absent) session state on this sessionless
 * server client, returning the client-side "Auth session missing!" error
 * before the token ever reaches Supabase. Calling the Auth API directly
 * makes validation deterministic: Supabase itself verifies the token against
 * the configured project and key, and any failure is a genuine rejection.
 */
async function verifySupabaseToken(token: string): Promise<SupabaseUser | undefined> {
  const response = await fetch(`${AUTH_API_BASE}/user`, {
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    console.error("[supabaseAuth] token verification failed", {
      message:
        (typeof body?.error_description === "string" && body.error_description) ||
        (typeof body?.error === "string" && body.error) ||
        (typeof body?.msg === "string" && body.msg) ||
        response.statusText,
      status: response.status,
      supabaseUrl: SUPABASE_URL,
      keySource: SUPABASE_KEY_SOURCE,
    });
    return undefined;
  }

  const user = (await response.json().catch(() => null)) as SupabaseUser | null;
  return user?.id ? user : undefined;
}

async function resolveSupabaseAccountContext(userId: string): Promise<AccountContext | undefined> {
  const result = await pool.query<{
    accountId: string;
    accountStatus: string;
    workspaceMode: string;
    accountRole: string;
    subscriptionStatus: string;
    planType: string | null;
    licensedLearnerCount: number | null;
    trialEndsAt: Date | null;
    trialExpired: boolean;
    licenseEndsAt: Date | null;
    cancelAtPeriodEnd: boolean;
    canceledAt: Date | null;
    successfulSolverGenerations: number;
  }>(

    `SELECT a.id AS "accountId", a.status AS "accountStatus", a.workspace_mode AS "workspaceMode",
            am.role AS "accountRole",
            COALESCE(s.status, 'trialing') AS "subscriptionStatus",
            s.plan_type AS "planType",
            s.licensed_learner_count AS "licensedLearnerCount",
            s.trial_ends_at AS "trialEndsAt",
            COALESCE(s.status, 'trialing') <> 'active' AND s.trial_ends_at IS NOT NULL AND s.trial_ends_at <= NOW() AS "trialExpired",
            s.license_ends_at AS "licenseEndsAt",
            COALESCE(s.cancel_at_period_end, FALSE) AS "cancelAtPeriodEnd",
            s.canceled_at AS "canceledAt",
            COALESCE(u.successful_solver_generations, 0)::int AS "successfulSolverGenerations"

     FROM account_memberships am
     JOIN accounts a ON a.id = am.account_id
     LEFT JOIN account_subscriptions s ON s.account_id = a.id
     LEFT JOIN account_usage u ON u.account_id = a.id
     WHERE am.user_id = $1 AND am.status = 'active'
     ORDER BY COALESCE(am.accepted_at, am.created_at) DESC, am.created_at DESC
     LIMIT 1`,
    [userId],
  );

  const membership = result.rows[0];
  if (!membership) return undefined;

  return {
    accountId: membership.accountId,
    accountStatus: membership.accountStatus,
    workspaceMode: membership.workspaceMode === "demo" ? "demo" : "live",
    accountRole: membership.accountRole,
    subscriptionStatus: membership.subscriptionStatus,
    planType: membership.planType,
    licensedLearnerCount: membership.licensedLearnerCount,
    trialEndsAt: membership.trialEndsAt ? membership.trialEndsAt.toISOString() : null,
    trialExpired: membership.subscriptionStatus === "active" ? false : membership.trialExpired,
    licenseEndsAt: membership.licenseEndsAt ? membership.licenseEndsAt.toISOString() : null,
    cancelAtPeriodEnd: membership.cancelAtPeriodEnd,
    canceledAt: membership.canceledAt ? membership.canceledAt.toISOString() : null,
    successfulSolverGenerations: membership.successfulSolverGenerations,
  };
}

export const requireSupabaseUser: RequestHandler = async (req, res, next) => {
  const token = bearerTokenFrom(req);

  try {
    let user = token ? await verifySupabaseToken(token) : undefined;

    // New-user signup/onboarding calls (used only by /api/onboarding/supabase
    // and /api/auth/handoff) can arrive with a stale, rotated or
    // not-yet-established access token. These callers also provide their
    // Supabase refresh token, so exchange it server-side: Supabase validates
    // the credential and returns a freshly verified user plus fresh tokens.
    // Identity is still verified entirely server-side — no client-supplied
    // identity is trusted, and invalid credentials keep receiving a 401.
    if (!user) {
      const refreshToken = typeof req.body?.refresh_token === "string" ? req.body.refresh_token : null;
      if (refreshToken) {
        // Same wire request supabase-js uses internally for a token refresh —
        // Supabase validates the refresh token server-side and returns a
        // freshly verified user plus fresh tokens.
        const refreshResponse = await fetch(`${AUTH_API_BASE}/token?grant_type=refresh_token`, {
          method: "POST",
          headers: {
            apikey: SUPABASE_PUBLISHABLE_KEY,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ refresh_token: refreshToken }),
        });

        if (refreshResponse.ok) {
          const session = (await refreshResponse.json().catch(() => null)) as {
            access_token?: string;
            refresh_token?: string;
            user?: SupabaseUser;
          } | null;
          if (session?.user?.id && session.access_token && session.refresh_token) {
            user = session.user;
            req.supabaseRefreshedSession = {
              access_token: session.access_token,
              refresh_token: session.refresh_token,
              user: session.user,
            };
          }
        } else {
          const body = (await refreshResponse.json().catch(() => null)) as Record<string, unknown> | null;
          // Metadata only — token values are never logged.
          console.warn("[supabaseAuth] refresh-token fallback rejected", {
            status: refreshResponse.status,
            code:
              (typeof body?.error_code === "string" && body.error_code) ||
              (typeof body?.error === "string" && body.error) ||
              null,
          });
        }
      } else {
        console.warn(
          "[supabaseAuth] refresh-token fallback unavailable: request body contains no refresh_token",
        );
      }
    }

    if (!user) {
      return res.status(401).json({
        message: token ? "Invalid Supabase access token" : "Supabase access token is required",
      });
    }

    req.supabaseUser = user;
    return next();
  } catch (error) {
    return res.status(401).json({ message: "Failed to verify Supabase access token" });
  }
};

export const authenticateSupabaseJwt: RequestHandler = async (req, res, next) => {
  const token = bearerTokenFrom(req);
  if (!token) return next();

  try {
    const user = await verifySupabaseToken(token);
    if (!user) {
      return res.status(401).json({ message: "Invalid Supabase access token" });
    }

    const accountContext = await resolveSupabaseAccountContext(user.id);
    if (!accountContext) {
      return res.status(403).json({ message: "No active account membership found" });
    }

    req.supabaseUser = user;
    req.supabaseAccountContext = accountContext;
    return next();
  } catch (error) {
    return res.status(401).json({ message: "Failed to verify Supabase access token" });
  }
};
