import type { RequestHandler } from "express";
import { pool } from "./db";
import { seedDemoData } from "./demoSeed";

interface OnboardingAccount {
  accountId: string;
  accountStatus: string;
  workspaceMode: "demo" | "live";
  accountRole: string;
  subscriptionStatus: string;
  planType: string | null;
  licensedLearnerCount: number | null;
  trialEndsAt: string | null;
  trialExpired: boolean;
  licenseEndsAt: string | null;
  cancelAtPeriodEnd: boolean;
  canceledAt: string | null;
  successfulSolverGenerations: number;
  isNewAccount: boolean;
}

function profileNameFromMetadata(metadata: Record<string, unknown> | undefined) {
  const firstName = typeof metadata?.first_name === "string" ? metadata.first_name : typeof metadata?.firstName === "string" ? metadata.firstName : null;
  const lastName = typeof metadata?.last_name === "string" ? metadata.last_name : typeof metadata?.lastName === "string" ? metadata.lastName : null;
  const avatarUrl = typeof metadata?.avatar_url === "string" ? metadata.avatar_url : typeof metadata?.avatarUrl === "string" ? metadata.avatarUrl : null;

  return { firstName, lastName, avatarUrl };
}

export async function ensureOnboardingAccount(user: NonNullable<Express.Request["supabaseUser"]>): Promise<OnboardingAccount> {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`supabase-onboarding:${user.id}`]);

    const { firstName, lastName, avatarUrl } = profileNameFromMetadata(user.user_metadata);
    await client.query(
      `INSERT INTO profiles (id, email, first_name, last_name, avatar_url)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE SET
         email = COALESCE(EXCLUDED.email, profiles.email),
         first_name = COALESCE(EXCLUDED.first_name, profiles.first_name),
         last_name = COALESCE(EXCLUDED.last_name, profiles.last_name),
         avatar_url = COALESCE(EXCLUDED.avatar_url, profiles.avatar_url),
         updated_at = NOW()`,
      [user.id, user.email ?? null, firstName, lastName, avatarUrl],
    );

    // Activate an administrator invitation before looking for an existing
    // account. New invitations already use the Supabase Auth user id; the email
    // match also reconciles placeholder profiles created by the legacy flow.
    if (user.email) {
      const invited = await client.query<{ membership_id: string; invited_user_id: string }>(
        `SELECT am.id AS membership_id, am.user_id AS invited_user_id
         FROM account_memberships am
         JOIN profiles p ON p.id = am.user_id
         WHERE am.status = 'invited'
           AND (am.user_id = $1 OR lower(p.email) = lower($2))
         ORDER BY CASE WHEN am.user_id = $1 THEN 0 ELSE 1 END, am.created_at ASC
         LIMIT 1
         FOR UPDATE OF am`,
        [user.id, user.email],
      );
      const invite = invited.rows[0];
      if (invite) {
        await client.query(
          `UPDATE account_memberships
           SET user_id = $1, status = 'active', accepted_at = NOW(), updated_at = NOW()
           WHERE id = $2`,
          [user.id, invite.membership_id],
        );
        if (invite.invited_user_id !== user.id) {
          await client.query(
            `DELETE FROM profiles p
             WHERE p.id = $1
               AND NOT EXISTS (SELECT 1 FROM account_memberships am WHERE am.user_id = p.id)`,
            [invite.invited_user_id],
          );
        }
      }
    }

    const existing = await client.query<OnboardingAccount>(
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
              COALESCE(u.successful_solver_generations, 0) AS "successfulSolverGenerations",
              FALSE AS "isNewAccount"
       FROM account_memberships am
       JOIN accounts a ON a.id = am.account_id
       LEFT JOIN account_subscriptions s ON s.account_id = a.id
       LEFT JOIN account_usage u ON u.account_id = a.id

       WHERE am.user_id = $1 AND am.status = 'active'
       ORDER BY am.created_at ASC
       LIMIT 1`,
      [user.id],
    );

    if (existing.rows[0]) {
      await client.query(
        `INSERT INTO account_usage (account_id, successful_solver_generations)
         VALUES ($1, 0)
         ON CONFLICT (account_id) DO NOTHING`,
        [existing.rows[0].accountId],
      );
      await client.query("COMMIT");
      const account = existing.rows[0];
      return {
        ...account,
        licensedLearnerCount: account.licensedLearnerCount === null ? null : Number(account.licensedLearnerCount),
        trialEndsAt: account.trialEndsAt ? new Date(account.trialEndsAt).toISOString() : null,
        licenseEndsAt: account.licenseEndsAt ? new Date(account.licenseEndsAt).toISOString() : null,
        canceledAt: account.canceledAt ? new Date(account.canceledAt).toISOString() : null,
        successfulSolverGenerations: Number(account.successfulSolverGenerations || 0),
        isNewAccount: false,
      };
    }

    const accountName = firstName ? `${firstName}'s ShuffleSchool Demo` : "ShuffleSchool Demo Account";
    const account = await client.query<OnboardingAccount>(
      `INSERT INTO accounts (name, slug, type, status, workspace_mode, created_by)

       VALUES ($1, NULL, 'school', 'trialing', 'demo', $2)
       RETURNING id AS "accountId", status AS "accountStatus", workspace_mode AS "workspaceMode"`,
      [accountName, user.id],
    );

    const accountId = account.rows[0].accountId;
    const now = new Date();
    const trialEndsAt = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

    await client.query(
      `INSERT INTO account_memberships (account_id, user_id, role, status, accepted_at)
       VALUES ($1, $2, 'owner', 'active', NOW())
       ON CONFLICT (account_id, user_id) DO UPDATE SET role = 'owner', status = 'active', accepted_at = COALESCE(account_memberships.accepted_at, NOW()), updated_at = NOW()`,
      [accountId, user.id],
    );

    await client.query(
      `INSERT INTO account_subscriptions (account_id, status, trial_started_at, trial_ends_at)
       VALUES ($1, 'trialing', $2, $3)
       ON CONFLICT (account_id) DO UPDATE SET status = 'trialing', trial_started_at = COALESCE(account_subscriptions.trial_started_at, EXCLUDED.trial_started_at), trial_ends_at = COALESCE(account_subscriptions.trial_ends_at, EXCLUDED.trial_ends_at), updated_at = NOW()`,
      [accountId, now, trialEndsAt],
    );

    await client.query(
      `INSERT INTO account_usage (account_id, successful_solver_generations)
       VALUES ($1, 0)
       ON CONFLICT (account_id) DO NOTHING`,
      [accountId],
    );

    await client.query("COMMIT");
    return {
      ...account.rows[0],
      subscriptionStatus: "trialing",
      accountRole: "owner",
      planType: null,
      licensedLearnerCount: null,
      trialEndsAt: trialEndsAt.toISOString(),
      trialExpired: false,
      licenseEndsAt: null,
      cancelAtPeriodEnd: false,
      canceledAt: null,
      successfulSolverGenerations: 0,
      isNewAccount: true,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {

    client.release();
  }
}

export const onboardSupabaseUser: RequestHandler = async (req, res) => {
  if (!req.supabaseUser) {
    return res.status(401).json({ message: "Supabase user is required" });
  }

  try {
    const account = await ensureOnboardingAccount(req.supabaseUser);
    const seed = account.isNewAccount ? await seedDemoData(account.accountId) : null;

    req.supabaseAccountContext = account;
    req.accountContext = account;

    res.status(200).json({
      accountContext: account,
      seed,
    });
  } catch (error) {
    console.error("[onboarding] failed to onboard Supabase user", {
      message: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ message: "Failed to onboard Supabase user" });
  }
};
