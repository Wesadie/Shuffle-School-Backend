import type { RequestHandler } from "express";
import { pool } from "./db";
import { getAccountContext, type AccountContext } from "./accountContext";

export const TRIAL_SOLVER_LIMIT = 3;

export type AccessErrorCode =
  | "TRIAL_EXPIRED"
  | "TRIAL_SOLVER_LIMIT_REACHED"
  | "TRIAL_EXPORT_RESTRICTED";

function accessError(code: AccessErrorCode, message: string) {
  return { code, message };
}

export function isSubscriptionActive(context: AccountContext): boolean {
  return context.subscriptionStatus === "active";
}

export function isTrialExpired(context: AccountContext): boolean {
  return !isSubscriptionActive(context) && context.trialExpired;
}

export function isTrialing(context: AccountContext): boolean {
  return context.subscriptionStatus === "trialing";
}

export function trialSolverUsesRemaining(context: AccountContext): number | null {
  if (!isTrialing(context) || isSubscriptionActive(context)) return null;
  return Math.max(0, TRIAL_SOLVER_LIMIT - context.successfulSolverGenerations);
}

export const requireWritableWorkspace: RequestHandler = (req, res, next) => {
  const context = getAccountContext(req);
  if (isTrialExpired(context)) {
    return res.status(403).json(accessError("TRIAL_EXPIRED", "Your trial has expired. This workspace is now read-only until you upgrade."));
  }
  next();
};

export const requireFinalExportAccess: RequestHandler = (req, res, next) => {
  const context = getAccountContext(req);
  if (!isSubscriptionActive(context)) {
    return res.status(403).json(accessError("TRIAL_EXPORT_RESTRICTED", "Final exports and reports are available after upgrading."));
  }
  next();
};

export async function reserveTrialSolverGeneration(context: AccountContext): Promise<"reserved" | "active" | "expired" | "limit"> {
  if (isSubscriptionActive(context)) return "active";
  if (isTrialExpired(context)) return "expired";

  const result = await pool.query<{ successful_solver_generations: number }>(
    `INSERT INTO account_usage (account_id, successful_solver_generations)
     VALUES ($1, 1)
     ON CONFLICT (account_id) DO UPDATE
       SET successful_solver_generations = account_usage.successful_solver_generations + 1,
           updated_at = NOW()
       WHERE account_usage.successful_solver_generations < $2
     RETURNING successful_solver_generations`,
    [context.accountId, TRIAL_SOLVER_LIMIT],
  );

  if (result.rows.length === 0) return "limit";
  context.successfulSolverGenerations = result.rows[0].successful_solver_generations;
  return "reserved";
}

export async function releaseTrialSolverGeneration(context: AccountContext): Promise<void> {
  if (isSubscriptionActive(context)) return;
  await pool.query(
    `UPDATE account_usage
     SET successful_solver_generations = GREATEST(successful_solver_generations - 1, 0), updated_at = NOW()
     WHERE account_id = $1`,
    [context.accountId],
  );
  context.successfulSolverGenerations = Math.max(0, context.successfulSolverGenerations - 1);
}

export function solverAccessResponse(status: "expired" | "limit") {
  if (status === "expired") {
    return accessError("TRIAL_EXPIRED", "Your trial has expired. Upgrade to generate new class lists.");
  }
  return accessError("TRIAL_SOLVER_LIMIT_REACHED", "You have used all 3 trial solver generations. Upgrade to generate more class lists.");
}
