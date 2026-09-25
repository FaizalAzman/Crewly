import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const serverOnlyStub = path.resolve(__dirname, "tests/support/server-only-stub.ts");

export default defineConfig({
  resolve: { tsconfigPaths: true, alias: { "server-only": serverOnlyStub } },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["tests/unit/**/*.test.ts"],
          environment: "node",
        },
      },
      {
        extends: true,
        test: {
          name: "business",
          include: ["tests/business/**/*.test.ts"],
          environment: "node",
          globalSetup: ["tests/business/global-setup.ts"],
          setupFiles: ["tests/business/setup-env.ts"],
          // One SQLite file shared by all business specs: run files serially, isolate data per tenant.
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 120_000,
        },
      },
    ],
  },
});
