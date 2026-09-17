import { pool } from "./db";

// Idempotent startup migrations for columns added after the original table
// definitions. Running these here keeps existing deployments working without
// a manual `drizzle-kit push`; each statement is safe to re-run.
const startupMigrations: string[] = [
  `ALTER TABLE rules ADD COLUMN IF NOT EXISTS importance text NOT NULL DEFAULT 'mandatory'`,
  `ALTER TABLE rules ADD COLUMN IF NOT EXISTS comment text`,
  `ALTER TABLE teachers ADD COLUMN IF NOT EXISTS survey_message text`,
  `ALTER TABLE teachers ADD COLUMN IF NOT EXISTS survey_settings jsonb`,
  `ALTER TABLE account_subscriptions ADD COLUMN IF NOT EXISTS cancel_at_period_end boolean NOT NULL DEFAULT false`,
  `ALTER TABLE account_subscriptions ADD COLUMN IF NOT EXISTS canceled_at timestamptz`,
  // Customer billing details ("bill to" record) for future invoices. Every
  // column is nullable so existing accounts without billing details keep
  // working unchanged.
  `CREATE TABLE IF NOT EXISTS account_billing_details (
     account_id uuid PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
     billing_name text,
     organisation_name text,
     address_line1 text,
     address_line2 text,
     city text,
     province text,
     postal_code text,
     country text,
     billing_email text,
     phone text,
     created_at timestamptz NOT NULL DEFAULT NOW(),
     updated_at timestamptz NOT NULL DEFAULT NOW()
   )`,
];

export async function ensureSchemaMigrations(): Promise<void> {
  for (const statement of startupMigrations) {
    try {
      await pool.query(statement);
    } catch (error) {
      // A missing table means the database has not been provisioned yet
      // (e.g. a fresh environment before `db:push`); queries elsewhere will
      // surface that clearly, so startup only warns here.
      console.warn(
        "[schema-migrations] skipped:",
        statement,
        error instanceof Error ? error.message : error,
      );
    }
  }
}
