CREATE TABLE "PromotionRedemption" (
    "id"          TEXT        NOT NULL,
    "promotionId" TEXT        NOT NULL,
    "userId"      TEXT        NOT NULL,
    "businessId"  TEXT        NOT NULL,
    "redeemedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromotionRedemption_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PromotionRedemption_promotionId_userId_key"
    ON "PromotionRedemption"("promotionId", "userId");

CREATE INDEX "PromotionRedemption_businessId_redeemedAt_idx"
    ON "PromotionRedemption"("businessId", "redeemedAt");

ALTER TABLE "PromotionRedemption"
    ADD CONSTRAINT "PromotionRedemption_promotionId_fkey"
    FOREIGN KEY ("promotionId") REFERENCES "Promotion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PromotionRedemption"
    ADD CONSTRAINT "PromotionRedemption_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PromotionRedemption"
    ADD CONSTRAINT "PromotionRedemption_businessId_fkey"
    FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
