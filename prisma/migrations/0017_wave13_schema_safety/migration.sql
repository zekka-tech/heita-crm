-- Migration: 0017_wave13_schema_safety
--
-- 1. OcrReceipt.parsedTotal: Float → Decimal(10,2) to avoid binary float rounding
--    on currency totals used in loyalty point calculations.
-- 2. StaffAuditLog.actorUserId: NOT NULL → nullable so audit rows survive user deletion
--    (onDelete: SetNull instead of Cascade).
-- 3. CHECK constraints: Membership.pointsBalance >= 0, Reward.stock >= 0
-- 4. MessageStatus enum: add RECEIVED value for inbound WhatsApp messages.
--    Note: ALTER TYPE ADD VALUE cannot run inside a transaction in PostgreSQL,
--    so it is placed outside the transaction block.

-- Add RECEIVED to MessageStatus before the transaction (cannot run inside BEGIN/COMMIT)
ALTER TYPE "MessageStatus" ADD VALUE IF NOT EXISTS 'RECEIVED';

BEGIN;

-- 1. OcrReceipt.parsedTotal Float → Decimal(10,2)
ALTER TABLE "OcrReceipt"
  ALTER COLUMN "parsedTotal" TYPE DECIMAL(10,2)
  USING "parsedTotal"::DECIMAL(10,2);

-- 2. Make StaffAuditLog.actorUserId nullable so deleted users don't cascade-delete audit rows
ALTER TABLE "StaffAuditLog"
  ALTER COLUMN "actorUserId" DROP NOT NULL;

-- Drop the Cascade FK and recreate as SetNull
ALTER TABLE "StaffAuditLog"
  DROP CONSTRAINT IF EXISTS "StaffAuditLog_actorUserId_fkey";

ALTER TABLE "StaffAuditLog"
  ADD CONSTRAINT "StaffAuditLog_actorUserId_fkey"
  FOREIGN KEY ("actorUserId")
  REFERENCES "User"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

-- 3a. Ensure Membership.pointsBalance never goes negative
ALTER TABLE "Membership"
  DROP CONSTRAINT IF EXISTS "membership_points_balance_non_negative";

ALTER TABLE "Membership"
  ADD CONSTRAINT "membership_points_balance_non_negative"
  CHECK ("pointsBalance" >= 0);

-- 3b. Ensure Reward.stock is either NULL (unlimited) or non-negative
ALTER TABLE "Reward"
  DROP CONSTRAINT IF EXISTS "reward_stock_non_negative";

ALTER TABLE "Reward"
  ADD CONSTRAINT "reward_stock_non_negative"
  CHECK ("stock" IS NULL OR "stock" >= 0);

COMMIT;
