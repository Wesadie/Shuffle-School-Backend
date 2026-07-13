import { existsSync } from "fs";
import { resolve } from "path";
import { config } from "dotenv";

const envFilename = ".env.local";
const envPath = resolve(process.cwd(), envFilename);

export function loadEnv() {
  config({ path: envPath, override: false });

  if (!process.env.DATABASE_URL && process.env.SUPABASE_DB_URL) {
    process.env.DATABASE_URL = process.env.SUPABASE_DB_URL;
  }

  console.log(
    `[env] loaded file: ${envFilename}; exists: ${existsSync(envPath)}; DATABASE_URL present: ${Boolean(process.env.DATABASE_URL)}`,
  );
}
