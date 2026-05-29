-- Account: index userId for faster auth lookups
CREATE INDEX IF NOT EXISTS "Account_userId_idx" ON "Account"("userId");

-- BusinessSubscription: enforce only one active/trialing subscription per business.
-- This is a partial unique index which Prisma schema cannot express natively.
CREATE UNIQUE INDEX IF NOT EXISTS "BusinessSubscription_businessId_active_unique"
  ON "BusinessSubscription"("businessId")
  WHERE "status" IN ('ACTIVE', 'TRIALING');

-- LoyaltyTransaction: prevent double referral bonus per membership.
-- One REFERRAL_BONUS row per membership is sufficient; duplicates are a sign of a race.
CREATE UNIQUE INDEX IF NOT EXISTS "LoyaltyTransaction_membershipId_referral_unique"
  ON "LoyaltyTransaction"("membershipId")
  WHERE "type" = 'REFERRAL_BONUS';
