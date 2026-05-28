-- prisma-migrate-no-transaction
-- Migration: 0016_perf_hnsw_and_missing_indexes
--
-- Addresses performance audit findings:
--   1. Replace IVFFlat with HNSW on DocumentChunk.embedding (H-1)
--   2. Add composite index for Business discovery queries (H-2, M-11)
--   3. Add composite index for Membership(userId, isActive) (M-14)
--   4. Add composite index for Event reminder cron filter (PERF-H2)
--   5. Drop duplicate IVFFlat index on DocumentChunk (L-7)
--
-- All DDL outside a transaction because CREATE/DROP INDEX CONCURRENTLY
-- cannot run inside BEGIN/COMMIT.

-- 1. Drop the duplicate legacy IVFFlat index (created in 0001_init)
DROP INDEX CONCURRENTLY IF EXISTS "doc_chunks_embedding_idx";

-- 2. Drop the old IVFFlat index (created in 0006_ivfflat_index)
DROP INDEX CONCURRENTLY IF EXISTS "DocumentChunk_embedding_cosine_idx";

-- 3. Create HNSW index for cosine similarity (pgvector >= 0.5)
--    ef_search default of 40 gives good recall; tune upward for higher quality.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "DocumentChunk_embedding_hnsw_idx"
  ON "DocumentChunk" USING hnsw ("embedding" vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- 4. Discovery: Business(category, province) for /categories/[category] pages
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Business_category_province_idx"
  ON "Business" ("category", "province")
  WHERE "deletedAt" IS NULL AND "isActive" = true;

-- 5. Wallet / home / profile: Membership(userId, isActive) for per-user lookups
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Membership_userId_isActive_idx"
  ON "Membership" ("userId", "isActive");

-- 6. Event reminder cron: (isReminderOn, reminderSentAt, startsAt) partial index
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Event_reminder_filter_idx"
  ON "Event" ("isReminderOn", "reminderSentAt", "startsAt")
  WHERE "isReminderOn" = true AND "reminderSentAt" IS NULL;

-- 7. LoyaltyTransaction expiry scan: partial index for the expiry cron
CREATE INDEX CONCURRENTLY IF NOT EXISTS "LoyaltyTransaction_expiry_scan_idx"
  ON "LoyaltyTransaction" ("membershipId", "expiresAt")
  WHERE "expirySourceId" IS NULL AND "refundSourceId" IS NULL;
