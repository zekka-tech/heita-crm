-- Performance indexes for analytics, membership lookup, and message direction filtering.
-- Note: CONCURRENTLY is omitted — Prisma 7 wraps every migration in a transaction
-- and CREATE INDEX CONCURRENTLY cannot run inside a transaction block.
-- These indexes are non-unique and safe to build transactionally on a live table.

CREATE INDEX IF NOT EXISTS "Membership_userId_isActive_idx"
  ON "Membership"("userId", "isActive");

CREATE INDEX IF NOT EXISTS "Membership_businessId_joinedAt_idx"
  ON "Membership"("businessId", "joinedAt");

CREATE INDEX IF NOT EXISTS "LoyaltyTransaction_businessId_type_createdAt_idx"
  ON "LoyaltyTransaction"("businessId", "type", "createdAt");

CREATE INDEX IF NOT EXISTS "Message_businessId_direction_createdAt_idx"
  ON "Message"("businessId", "direction", "createdAt");
