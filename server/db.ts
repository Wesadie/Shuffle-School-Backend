import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "@shared/schema";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

const databaseUrl = new URL(process.env.DATABASE_URL);
console.log(`[db] database host: ${databaseUrl.hostname}`);

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool, { schema });

void (async () => {
  try {
    console.log("[db] connectivity check started");
    await pool.query("SELECT 1");
    console.log("[db] SELECT 1 completed");

    const result = await pool.query("SELECT COUNT(*)::int AS count FROM students");
    console.log(`[db] students count completed with row count: ${result.rows[0]?.count ?? 0}`);
  } catch (error) {
    console.error("[db] connectivity check caught error", {
      message: error instanceof Error ? error.message : String(error),
    });
  }
})();
