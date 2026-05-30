-- Performance indexes for analytics, membership lookup, and message direction filtering.
-- All indexes are CONCURRENT so they do not lock writes on production.
-- NOTE: prisma migrate deploy wraps each migration in a transaction; CONCURRENTLY
-- is not allowed inside a transaction. The no-transaction directive below disables
-- that wrapper for this file only.

-- @no-transaction

CREATE INDEX CONCURRENTLY IF NOT EXISTS "Membership_userId_isActive_idx"
  ON "Membership"("userId", "isActive");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "Membership_businessId_joinedAt_idx"
  ON "Membership"("businessId", "joinedAt");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "LoyaltyTransaction_businessId_type_createdAt_idx"
  ON "LoyaltyTransaction"("businessId", "type", "createdAt");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "Message_businessId_direction_createdAt_idx"
  ON "Message"("businessId", "direction", "createdAt");
