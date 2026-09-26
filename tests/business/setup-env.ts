// Runs in each worker before any spec imports the Prisma client.
process.env.DATABASE_URL = `file:./${process.env.TEST_DB_NAME ?? "test.db"}`;
process.env.SESSION_SECRET = "business-test-secret-at-least-16-chars";
