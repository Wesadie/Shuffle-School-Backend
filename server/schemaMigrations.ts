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
  // Invoices: one row per successful, validated PayFast payment. The unique
  // index on payfast_payment_id prevents duplicate invoices when PayFast
  // re-sends the same successful ITN. Only new payments are invoiced — no
  // historical backfill.
  `CREATE TABLE IF NOT EXISTS invoices (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
     invoice_number text NOT NULL,
     invoice_date timestamptz NOT NULL DEFAULT NOW(),
     payfast_payment_id text NOT NULL,
     transaction_id uuid REFERENCES account_payment_transactions(id) ON DELETE SET NULL,
     transaction_type text NOT NULL,
     status text NOT NULL DEFAULT 'paid',
     plan_type text NOT NULL,
     learner_quantity integer NOT NULL,
     price_per_learner_cents integer NOT NULL,
     subtotal_cents integer NOT NULL,
     vat_cents integer NOT NULL DEFAULT 0,
     total_cents integer NOT NULL,
     currency text NOT NULL DEFAULT 'ZAR',
     billing_snapshot jsonb,
     licence_period_start timestamptz,
     licence_period_end timestamptz,
     emailed_at timestamptz,
     created_at timestamptz NOT NULL DEFAULT NOW(),
     updated_at timestamptz NOT NULL DEFAULT NOW()
   )`,
  `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS emailed_at timestamptz`,
  `CREATE UNIQUE INDEX IF NOT EXISTS invoices_invoice_number_unique ON invoices (invoice_number)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS invoices_payfast_payment_id_unique ON invoices (payfast_payment_id)`,
  `CREATE INDEX IF NOT EXISTS invoices_account_id_idx ON invoices (account_id)`,
  // Per-year invoice number sequence (SS-YYYY-00001).
  `CREATE TABLE IF NOT EXISTS invoice_counters (
     year integer PRIMARY KEY,
     last_number integer NOT NULL
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
