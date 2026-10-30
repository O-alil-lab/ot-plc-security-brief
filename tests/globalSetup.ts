import { execSync } from "node:child_process";
import { config } from "dotenv";

/**
 * Apply migrations to the dedicated test database once per run.
 * Each test file then truncates tables with resetDb() (tests/helpers.ts).
 */
export default function setup() {
  config({ quiet: true });
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL must be set to run tests (its tables are truncated).");
  if (url === process.env.DATABASE_URL) throw new Error("TEST_DATABASE_URL must differ from DATABASE_URL.");
  execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
}
