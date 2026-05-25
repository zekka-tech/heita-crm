-- Wave 7: promotions go from read-only to a full staff CRUD with
-- redemption codes, tier targeting, and a broadcast audit row.

ALTER TABLE "Promotion"
ADD COLUMN "code" TEXT,
ADD COLUMN "targetTierIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "broadcastAt" TIMESTAMP(3),
ADD COLUMN "broadcastSentBy" TEXT;

CREATE UNIQUE INDEX "Promotion_businessId_code_key"
  ON "Promotion"("businessId", "code")
  WHERE "code" IS NOT NULL;

CREATE INDEX "Promotion_businessId_isActive_endsAt_idx"
  ON "Promotion"("businessId", "isActive", "endsAt");
