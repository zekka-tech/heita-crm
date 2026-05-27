-- Wave 15: add missing query-support indexes
-- Message.userId: speeds up per-user message lookups and cascade deletes
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Message_userId_idx"
  ON "Message"("userId");

-- OcrReceipt: extend (businessId, status) to include createdAt so that
-- PENDING_REVIEW listing queries (ORDER BY createdAt ASC) are fully covered
DROP INDEX CONCURRENTLY IF EXISTS "OcrReceipt_businessId_status_idx";
CREATE INDEX CONCURRENTLY IF NOT EXISTS "OcrReceipt_businessId_status_createdAt_idx"
  ON "OcrReceipt"("businessId", "status", "createdAt");
