import dotenv from "dotenv";

const parsed = dotenv.config().parsed ?? {};
const testUrl = process.env.TEST_DATABASE_URL ?? parsed.TEST_DATABASE_URL;

if (!testUrl) {
  throw new Error(
    "TEST_DATABASE_URL is not set. Point it at a Neon test branch before running DB-backed tests.",
  );
}

if (testUrl === (process.env.DATABASE_URL ?? parsed.DATABASE_URL)) {
  throw new Error("TEST_DATABASE_URL must not equal DATABASE_URL.");
}

// The app reads DATABASE_URL at import time; force it onto the test branch so a
// stray shell variable or .env value can never send tests to production.
process.env.DATABASE_URL = testUrl;
process.env.JWT_SECRET ??= "test-secret-not-for-production";
