import type { RequestHandler } from "express";
import { createClient, type User as SupabaseUser } from "@supabase/supabase-js";
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

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

declare global {
  namespace Express {
    interface Request {
      supabaseUser?: SupabaseUser;
      supabaseAccountContext?: AccountContext;
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

async function verifySupabaseToken(token: string): Promise<SupabaseUser | undefined> {
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    console.error("[supabaseAuth] token verification failed", {
      message: error?.message,
      status: (error as { status?: number } | undefined)?.status,
      code: (error as { code?: string } | undefined)?.code,
      supabaseUrl: SUPABASE_URL,
      keySource: SUPABASE_KEY_SOURCE,
      keyLength: SUPABASE_PUBLISHABLE_KEY.length,
    });
    return undefined;
  }
  return data.user;
}

async function resolveSupabaseAccountContext(userId: string): Promise<AccountContext | undefined> {
  const result = await pool.query<{
    accountId: string;
    accountStatus: string;
    workspaceMode: string;
    subscriptionStatus: string;
    licensedLearnerCount: number | null;
    trialEndsAt: Date | null;
    trialExpired: boolean;
    successfulSolverGenerations: number;
  }>(
    `SELECT a.id AS "accountId", a.status AS "accountStatus", a.workspace_mode AS "workspaceMode",
            COALESCE(s.status, 'trialing') AS "subscriptionStatus",
            s.licensed_learner_count AS "licensedLearnerCount",
            s.trial_ends_at AS "trialEndsAt",
            COALESCE(s.status, 'trialing') <> 'active' AND s.trial_ends_at IS NOT NULL AND s.trial_ends_at <= NOW() AS "trialExpired",
            COALESCE(u.successful_solver_generations, 0)::int AS "successfulSolverGenerations"
     FROM account_memberships am
     JOIN accounts a ON a.id = am.account_id
     LEFT JOIN account_subscriptions s ON s.account_id = a.id
     LEFT JOIN account_usage u ON u.account_id = a.id
     WHERE am.user_id = $1 AND am.status = 'active'
     ORDER BY am.created_at ASC
     LIMIT 1`,
    [userId],
  );

  const membership = result.rows[0];
  if (!membership) return undefined;

  return {
    accountId: membership.accountId,
    accountStatus: membership.accountStatus,
    workspaceMode: membership.workspaceMode === "demo" ? "demo" : "live",
    subscriptionStatus: membership.subscriptionStatus,
    licensedLearnerCount: membership.licensedLearnerCount,
    trialEndsAt: membership.trialEndsAt ? membership.trialEndsAt.toISOString() : null,
    trialExpired: membership.subscriptionStatus === "active" ? false : membership.trialExpired,
    successfulSolverGenerations: membership.successfulSolverGenerations,
  };
}

export const requireSupabaseUser: RequestHandler = async (req, res, next) => {
  const token = bearerTokenFrom(req);
  if (!token) return res.status(401).json({ message: "Supabase access token is required" });

  try {
    const user = await verifySupabaseToken(token);
    if (!user) return res.status(401).json({ message: "Invalid Supabase access token" });
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
