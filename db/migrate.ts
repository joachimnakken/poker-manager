/**
 * Applies db/schema.sql to the database in DATABASE_URL. The schema is idempotent
 * (`create ... if not exists` throughout), so this is safe to run repeatedly.
 *
 *   npm run db:migrate            # .env.local → the Neon `dev` branch
 *   DATABASE_URL=... npm run db:migrate
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";

const envPath = join(import.meta.dirname, "..", ".env.local");
if (!process.env.DATABASE_URL) {
  try {
    const line = readFileSync(envPath, "utf8")
      .split("\n")
      .find((l) => l.startsWith("DATABASE_URL="));
    if (line) {
      process.env.DATABASE_URL = line.slice("DATABASE_URL=".length).replace(/^"|"$/g, "");
    }
  } catch {
    // No .env.local — DATABASE_URL must come from the environment.
  }
}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set and .env.local has none.");
  process.exit(1);
}

const schema = readFileSync(join(import.meta.dirname, "schema.sql"), "utf8");
const client = new Client({ connectionString: process.env.DATABASE_URL });

await client.connect();
try {
  await client.query(schema);
  const { rows } = await client.query(
    `select table_name from information_schema.tables
     where table_schema = 'public' order by table_name`,
  );
  console.log(`Schema applied. Tables: ${rows.map((r) => r.table_name).join(", ")}`);
} finally {
  await client.end();
}
