import type { RequestHandler } from "express";
import { createClient, type User as SupabaseUser } from "@supabase/supabase-js";
import { and, eq } from "drizzle-orm";
import { accounts, accountMemberships } from "@shared/schema";
import { db } from "./db";
import type { AccountContext } from "./accountContext";

const SUPABASE_URL = process.env.SUPABASE_URL ?? "https://xhtyynajsnnuxfvfqghg.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
  process.env.SUPABASE_ANON_KEY ??
  process.env.SUPABASE_PUBLISHABLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhodHl5bmFqc25udXhmdmZxZ2hnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM0Mjc1NDgsImV4cCI6MjA5OTAwMzU0OH0.5mE-xJlm_Dx8CYdAamFEUMczd_jS0wCpgPjAtBZjNAQ";

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

async function resolveSupabaseAccountContext(userId: string): Promise<AccountContext | undefined> {
  const [membership] = await db
    .select({
      accountId: accounts.id,
      accountStatus: accounts.status,
      workspaceMode: accounts.workspaceMode,
    })
    .from(accountMemberships)
    .innerJoin(accounts, eq(accountMemberships.accountId, accounts.id))
    .where(and(eq(accountMemberships.userId, userId), eq(accountMemberships.status, "active")))
    .limit(1);

  if (!membership) return undefined;

  return {
    accountId: membership.accountId,
    accountStatus: membership.accountStatus,
    workspaceMode: membership.workspaceMode === "demo" ? "demo" : "live",
  };
}

export const authenticateSupabaseJwt: RequestHandler = async (req, res, next) => {
  const token = bearerTokenFrom(req);
  if (!token) return next();

  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) {
      return res.status(401).json({ message: "Invalid Supabase access token" });
    }

    const accountContext = await resolveSupabaseAccountContext(data.user.id);
    if (!accountContext) {
      return res.status(403).json({ message: "No active account membership found" });
    }

    req.supabaseUser = data.user;
    req.supabaseAccountContext = accountContext;
    return next();
  } catch (error) {
    return res.status(401).json({ message: "Failed to verify Supabase access token" });
  }
};
