-- Wave 15: add missing query-support indexes
-- Note: CONCURRENTLY removed — Prisma 7 wraps every migration in a transaction
-- and CREATE/DROP INDEX CONCURRENTLY cannot run inside a transaction block.

-- Message.userId: speeds up per-user message lookups and cascade deletes
CREATE INDEX IF NOT EXISTS "Message_userId_idx"
  ON "Message"("userId");

-- OcrReceipt: extend (businessId, status) to include createdAt so that
-- PENDING_REVIEW listing queries (ORDER BY createdAt ASC) are fully covered
DROP INDEX IF EXISTS "OcrReceipt_businessId_status_idx";
CREATE INDEX IF NOT EXISTS "OcrReceipt_businessId_status_createdAt_idx"
  ON "OcrReceipt"("businessId", "status", "createdAt");
