import type { PoolClient } from "pg";
import { pool } from "./db";

export type LicensePlanType = "teacher" | "school";

export type PaymentTransactionType = "initial" | "topup" | "renewal";

export interface LicenseOperationResult {
  accountId: string;
  subscriptionStatus: string;
  planType: LicensePlanType | null;
  licensedLearnerCount: number | null;
  licenseStartedAt: string | null;
  licenseEndsAt: string | null;
  transactionId: string;
  idempotent: boolean;
}

const LICENSE_TERM_SQL = "12 months";

function assertPositiveInteger(value: number, name: string) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
}

function assertValidAmount(amountCents: number) {
  if (!Number.isInteger(amountCents) || amountCents < 0) {
    throw new Error("amountCents must be a non-negative integer");
  }
}

function assertPaymentReference(paymentReference: string) {
  if (!paymentReference.trim()) {
    throw new Error("paymentReference is required");
  }
}

export function assertLicensePlanType(planType: string): asserts planType is LicensePlanType {
  if (planType !== "teacher" && planType !== "school") {
    throw new Error("planType must be teacher or school");
  }
}

function toResult(row: {
  accountId: string;
  subscriptionStatus: string;
  planType: LicensePlanType | null;
  licensedLearnerCount: number | null;
  licenseStartedAt: Date | null;
  licenseEndsAt: Date | null;
  transactionId: string;
}, idempotent: boolean): LicenseOperationResult {
  return {
    accountId: row.accountId,
    subscriptionStatus: row.subscriptionStatus,
    planType: row.planType,
    licensedLearnerCount: row.licensedLearnerCount,
    licenseStartedAt: row.licenseStartedAt?.toISOString() ?? null,
    licenseEndsAt: row.licenseEndsAt?.toISOString() ?? null,
    transactionId: row.transactionId,
    idempotent,
  };
}

async function getExistingPaymentResult(client: PoolClient, paymentReference: string): Promise<LicenseOperationResult | null> {
  const existing = await client.query<{
    accountId: string;
    subscriptionStatus: string;
    planType: LicensePlanType | null;
    licensedLearnerCount: number | null;
    licenseStartedAt: Date | null;
    licenseEndsAt: Date | null;
    transactionId: string;
  }>(
    `SELECT t.account_id AS "accountId",
            s.status AS "subscriptionStatus",
            s.plan_type AS "planType",
            s.licensed_learner_count AS "licensedLearnerCount",
            s.license_started_at AS "licenseStartedAt",
            s.license_ends_at AS "licenseEndsAt",
            t.id AS "transactionId"
     FROM account_payment_transactions t
     JOIN account_subscriptions s ON s.account_id = t.account_id
     WHERE t.provider_payment_id = $1
     LIMIT 1`,
    [paymentReference],
  );

  return existing.rows[0] ? toResult(existing.rows[0], true) : null;
}

export async function activateInitialLicense(
  accountId: string,
  planType: LicensePlanType,
  learnerCount: number,
  amountCents: number,
  paymentReference: string,
): Promise<LicenseOperationResult> {
  if (planType !== "teacher" && planType !== "school") throw new Error("planType must be teacher or school");
  assertPositiveInteger(learnerCount, "learnerCount");
  assertValidAmount(amountCents);
  assertPaymentReference(paymentReference);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`license-payment:${paymentReference}`]);

    const existing = await getExistingPaymentResult(client, paymentReference);
    if (existing) {
      await client.query("COMMIT");
      return existing;
    }

    const result = await client.query<{
      accountId: string;
      subscriptionStatus: string;
      planType: LicensePlanType;
      licensedLearnerCount: number;
      licenseStartedAt: Date;
      licenseEndsAt: Date;
      transactionId: string;
    }>(
      `WITH subscription AS (
         INSERT INTO account_subscriptions (
           account_id, status, plan_type, licensed_learner_count, license_started_at, license_ends_at, updated_at
         )
         VALUES ($1, 'active', $2, $3, NOW(), NOW() + $6::interval, NOW())
         ON CONFLICT (account_id) DO UPDATE SET
           status = 'active',
           plan_type = EXCLUDED.plan_type,
           licensed_learner_count = EXCLUDED.licensed_learner_count,
           license_started_at = EXCLUDED.license_started_at,
           license_ends_at = EXCLUDED.license_ends_at,
           updated_at = NOW()
         RETURNING account_id, status, plan_type, licensed_learner_count, license_started_at, license_ends_at
       ), transaction AS (
         INSERT INTO account_payment_transactions (
           account_id, transaction_type, payment_status, learner_quantity, amount_cents, provider_payment_id, completed_at
         )
         VALUES ($1, 'initial', 'completed', $3, $4, $5, NOW())
         RETURNING id
       )
       SELECT subscription.account_id AS "accountId",
              subscription.status AS "subscriptionStatus",
              subscription.plan_type AS "planType",
              subscription.licensed_learner_count AS "licensedLearnerCount",
              subscription.license_started_at AS "licenseStartedAt",
              subscription.license_ends_at AS "licenseEndsAt",
              transaction.id AS "transactionId"
       FROM subscription, transaction`,
      [accountId, planType, learnerCount, amountCents, paymentReference, LICENSE_TERM_SQL],
    );

    await client.query("COMMIT");
    return toResult(result.rows[0], false);
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("[licenseService] activateInitialLicense failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    throw error;
  } finally {
    client.release();
  }
}

export async function addLearnerCapacity(

  accountId: string,
  additionalLearners: number,
  amountCents: number,
  paymentReference: string,
): Promise<LicenseOperationResult> {
  assertPositiveInteger(additionalLearners, "additionalLearners");
  assertValidAmount(amountCents);
  assertPaymentReference(paymentReference);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`license-payment:${paymentReference}`]);

    const existing = await getExistingPaymentResult(client, paymentReference);
    if (existing) {
      await client.query("COMMIT");
      return existing;
    }

    const result = await client.query<{
      accountId: string;
      subscriptionStatus: string;
      planType: LicensePlanType | null;
      licensedLearnerCount: number;
      licenseStartedAt: Date | null;
      licenseEndsAt: Date | null;
      transactionId: string;
    }>(
      `WITH subscription AS (
         UPDATE account_subscriptions
         SET licensed_learner_count = licensed_learner_count + $2,
             updated_at = NOW()
         WHERE account_id = $1
           AND status = 'active'
           AND licensed_learner_count IS NOT NULL
           AND license_ends_at IS NOT NULL
           AND license_ends_at > NOW()
         RETURNING account_id, status, plan_type, licensed_learner_count, license_started_at, license_ends_at
       ), transaction AS (
         INSERT INTO account_payment_transactions (
           account_id, transaction_type, payment_status, learner_quantity, amount_cents, provider_payment_id, completed_at
         )
         SELECT account_id, 'topup', 'completed', $2, $3, $4, NOW()
         FROM subscription
         RETURNING id
       )
       SELECT subscription.account_id AS "accountId",
              subscription.status AS "subscriptionStatus",
              subscription.plan_type AS "planType",
              subscription.licensed_learner_count AS "licensedLearnerCount",
              subscription.license_started_at AS "licenseStartedAt",
              subscription.license_ends_at AS "licenseEndsAt",
              transaction.id AS "transactionId"
       FROM subscription, transaction`,
      [accountId, additionalLearners, amountCents, paymentReference],
    );

    if (!result.rows[0]) {
      throw new Error("An active licence is required before adding learner capacity");
    }

    await client.query("COMMIT");
    return toResult(result.rows[0], false);
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("[licenseService] addLearnerCapacity failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    throw error;
  } finally {
    client.release();
  }
}

export async function renewLicense(

  accountId: string,
  amountCents: number,
  paymentReference: string,
): Promise<LicenseOperationResult> {
  assertValidAmount(amountCents);
  assertPaymentReference(paymentReference);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`license-payment:${paymentReference}`]);

    const existing = await getExistingPaymentResult(client, paymentReference);
    if (existing) {
      await client.query("COMMIT");
      return existing;
    }

    const result = await client.query<{
      accountId: string;
      subscriptionStatus: string;
      planType: LicensePlanType | null;
      licensedLearnerCount: number;
      licenseStartedAt: Date | null;
      licenseEndsAt: Date;
      transactionId: string;
    }>(
      `WITH subscription AS (
         UPDATE account_subscriptions
         SET status = 'active',
             license_started_at = COALESCE(license_started_at, NOW()),
             license_ends_at = CASE
               WHEN license_ends_at IS NOT NULL AND license_ends_at > NOW()
                 THEN license_ends_at + $4::interval
               ELSE NOW() + $4::interval
             END,
             updated_at = NOW()
         WHERE account_id = $1
           AND licensed_learner_count IS NOT NULL
         RETURNING account_id, status, plan_type, licensed_learner_count, license_started_at, license_ends_at
       ), transaction AS (
         INSERT INTO account_payment_transactions (
           account_id, transaction_type, payment_status, learner_quantity, amount_cents, provider_payment_id, completed_at
         )
         SELECT account_id, 'renewal', 'completed', licensed_learner_count, $2, $3, NOW()
         FROM subscription
         RETURNING id
       )
       SELECT subscription.account_id AS "accountId",
              subscription.status AS "subscriptionStatus",
              subscription.plan_type AS "planType",
              subscription.licensed_learner_count AS "licensedLearnerCount",
              subscription.license_started_at AS "licenseStartedAt",
              subscription.license_ends_at AS "licenseEndsAt",
              transaction.id AS "transactionId"
       FROM subscription, transaction`,
      [accountId, amountCents, paymentReference, LICENSE_TERM_SQL],
    );

    if (!result.rows[0]) {
      throw new Error("An existing licensed learner count is required before renewal");
    }

    await client.query("COMMIT");
    return toResult(result.rows[0], false);
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("[licenseService] renewLicense failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    throw error;
  } finally {
    client.release();
  }
}
