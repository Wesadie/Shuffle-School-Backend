import type { RequestHandler } from "express";
import { DEVELOPMENT_ACCOUNT_ID } from "@shared/schema";
import { db } from "./db";
import { accounts } from "@shared/schema";
import { eq } from "drizzle-orm";

export interface AccountContext {
  accountId: string;
  accountStatus: string;
  workspaceMode: "demo" | "live";
}

declare global {
  namespace Express {
    interface Request {
      accountContext?: AccountContext;
    }
  }
}

export async function resolveAccountContext(): Promise<AccountContext> {
  const [account] = await db
    .select({ id: accounts.id, status: accounts.status, workspaceMode: accounts.workspaceMode })
    .from(accounts)
    .where(eq(accounts.id, DEVELOPMENT_ACCOUNT_ID));

  return {
    accountId: account?.id ?? DEVELOPMENT_ACCOUNT_ID,
    accountStatus: account?.status ?? "active",
    workspaceMode: account?.workspaceMode === "demo" ? "demo" : "live",
  };
}

export const attachAccountContext: RequestHandler = async (_req, res, next) => {
  try {
    _req.accountContext = await resolveAccountContext();
    next();
  } catch (error) {
    res.status(500).json({ message: "Failed to resolve account context" });
  }
};

export function getAccountContext(req: { accountContext?: AccountContext }): AccountContext {
  if (!req.accountContext) {
    throw new Error("Account context has not been resolved");
  }
  return req.accountContext;
}
