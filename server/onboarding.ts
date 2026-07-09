import type { RequestHandler } from "express";
import { pool } from "./db";
import { seedDemoData } from "./demoSeed";

interface OnboardingAccount {
  accountId: string;
  accountStatus: string;
  workspaceMode: "demo" | "live";
}

function profileNameFromMetadata(metadata: Record<string, unknown> | undefined) {
  const firstName = typeof metadata?.first_name === "string" ? metadata.first_name : typeof metadata?.firstName === "string" ? metadata.firstName : null;
  const lastName = typeof metadata?.last_name === "string" ? metadata.last_name : typeof metadata?.lastName === "string" ? metadata.lastName : null;
  const avatarUrl = typeof metadata?.avatar_url === "string" ? metadata.avatar_url : typeof metadata?.avatarUrl === "string" ? metadata.avatarUrl : null;
  return { firstName, lastName, avatarUrl };
}

async function ensureOnboardingAccount(user: NonNullable<Express.Request["supabaseUser"]>): Promise<OnboardingAccount> {
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

    const existing = await client.query<OnboardingAccount>(
      `SELECT a.id AS "accountId", a.status AS "accountStatus", a.workspace_mode AS "workspaceMode"
       FROM account_memberships am
       JOIN accounts a ON a.id = am.account_id
       WHERE am.user_id = $1 AND am.status = 'active'
       ORDER BY am.created_at ASC
       LIMIT 1`,
      [user.id],
    );

    if (existing.rows[0]) {
      await client.query("COMMIT");
      return existing.rows[0];
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
    const trialEndsAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

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

    await client.query("COMMIT");
    return account.rows[0];
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
    const seed = await seedDemoData(account.accountId);

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
