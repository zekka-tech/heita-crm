/**
 * db-preflight.ts
 *
 * Run BEFORE `prisma migrate deploy` on a fresh database to work around the
 * ALTER TYPE ADD VALUE limitation in migration 0017.
 *
 * Migration 0017 adds the RECEIVED value to the MessageStatus enum using a
 * COMMIT/BEGIN trick that breaks Prisma's transaction wrapper on a fresh DB
 * (Prisma 7 does not support the --no-transaction migration directive).
 *
 * This script pre-creates MessageStatus with all required values so that:
 *   - The DO block in 0017 sees the type already exists (no-op).
 *   - The COMMIT in 0017 commits Prisma's empty transaction (harmless).
 *   - The ALTER TYPE ADD VALUE IF NOT EXISTS is a no-op.
 *   - The remaining DDL in 0017 runs in the new BEGIN block as intended.
 *
 * Usage (called automatically by `npm run db:setup`):
 *   npx tsx scripts/db-preflight.ts
 */
import "dotenv/config";

import { Client } from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const client = new Client({ connectionString: url });

async function run() {
  await client.connect();
  console.warn("[db-preflight] Connected.");

  await client.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_type
        WHERE typname = 'MessageStatus'
          AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
      ) THEN
        CREATE TYPE "MessageStatus" AS ENUM (
          'QUEUED', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'RECEIVED'
        );
        RAISE NOTICE 'MessageStatus enum created.';
      ELSE
        RAISE NOTICE 'MessageStatus enum already exists — skipping.';
      END IF;
    END
    $$;
  `);

  console.warn("[db-preflight] MessageStatus enum ready.");
  await client.end();
}

run().catch((err) => {
  console.error("[db-preflight] Error:", err);
  process.exit(1);
});
