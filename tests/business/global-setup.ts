import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import path from "node:path";

/**
 * Creates a fresh SQLite database for the business-rule suite.
 * The suite owns prisma/test.db exclusively: we delete that single file (never dev.db) and
 * push the schema into a new one. Each spec then creates its own isolated tenant.
 */
export default function setup() {
  const root = path.resolve(__dirname, "../..");
  const dbFile = path.join(root, "prisma", "test.db");
  for (const f of [dbFile, `${dbFile}-journal`]) rmSync(f, { force: true });
  execSync("npx prisma db push --skip-generate", {
    cwd: root,
    env: { ...process.env, DATABASE_URL: "file:./test.db", PRISMA_HIDE_UPDATE_MESSAGE: "1" },
    stdio: "pipe",
  });
}
