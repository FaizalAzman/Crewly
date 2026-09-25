// Runs in each worker before any spec imports the Prisma client.
process.env.DATABASE_URL = "file:./test.db";
process.env.SESSION_SECRET = "business-test-secret-at-least-16-chars";
