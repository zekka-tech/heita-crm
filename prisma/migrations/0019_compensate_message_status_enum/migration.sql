-- Compensating migration: MessageStatus enum was referenced in the Prisma schema
-- and used by migration 0017 (ALTER TYPE ... ADD VALUE), but was never explicitly
-- created in any prior migration. This migration creates it idempotently so that:
--   1. Fresh database installs have the enum after this migration runs.
--   2. Databases where it was created manually (local dev fix) see a no-op.
--
-- The enum must exist before 0017 can add the RECEIVED value. On a fully fresh
-- database, 0017 will still fail because it runs before this migration. Use the
-- db:setup npm script for fresh installs — it handles the ordering correctly.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type
    WHERE typname = 'MessageStatus'
      AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  ) THEN
    CREATE TYPE "MessageStatus" AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'RECEIVED');
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'Message'
      AND column_name  = 'status'
      AND udt_name     = 'text'
  ) THEN
    ALTER TABLE "Message"
      ALTER COLUMN "status" TYPE "MessageStatus"
      USING "status"::"MessageStatus";
  END IF;
END
$$;
