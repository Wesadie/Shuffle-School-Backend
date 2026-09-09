import { pool } from "./db";

// Idempotent startup migrations for rules columns added after the original
// table definition. Running these here keeps existing deployments working
// without a manual `drizzle-kit push`; each statement is safe to re-run.
const startupMigrations: string[] = [
  `ALTER TABLE rules ADD COLUMN IF NOT EXISTS importance text NOT NULL DEFAULT 'mandatory'`,
  `ALTER TABLE rules ADD COLUMN IF NOT EXISTS comment text`,
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
