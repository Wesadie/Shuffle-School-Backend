import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "@shared/schema";

const connectionString = process.env.DATABASE_URL ?? process.env.SUPABASE_DB_URL;

if (connectionString) {
  const databaseUrl = new URL(connectionString);
  console.log(`[db] database host: ${databaseUrl.hostname}`);
} else {
  console.warn("[db] DATABASE_URL or SUPABASE_DB_URL is not set; database queries will fail until one is configured");
}

export const pool = new Pool({ connectionString });
export const db = drizzle(pool, { schema });

void (async () => {
  if (!connectionString) return;

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
