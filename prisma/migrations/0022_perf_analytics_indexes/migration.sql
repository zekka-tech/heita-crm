-- Indexes for analytics time-series queries grouped by business.
-- These are non-unique and can be created concurrently in production if
-- desired to avoid locking the table, but prisma migrate deploy wraps in a
-- transaction so they run serially here.

-- LoyaltyTransaction: already has (businessId, createdAt) from 0015; this is
-- a no-op safety guard using IF NOT EXISTS.
CREATE INDEX IF NOT EXISTS "LoyaltyTransaction_businessId_createdAt_idx"
  ON "LoyaltyTransaction"("businessId", "createdAt");

-- AiTokenUsage: already has (businessId, createdAt) from 0004; same guard.
CREATE INDEX IF NOT EXISTS "AiTokenUsage_businessId_createdAt_idx"
  ON "AiTokenUsage"("businessId", "createdAt");
