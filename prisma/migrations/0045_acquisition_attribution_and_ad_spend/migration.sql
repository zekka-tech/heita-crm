-- Merchant-acquisition attribution + platform ad-spend for per-channel CAC/LTV reporting.

-- AlterTable: capture UTM-derived acquisition attribution on the business record.
ALTER TABLE "Business" ADD COLUMN "acquisitionSource" TEXT,
ADD COLUMN "acquisitionMedium" TEXT,
ADD COLUMN "acquisitionCampaign" TEXT;

-- CreateTable: platform-level marketing spend per channel/period (not tenant-scoped).
CREATE TABLE "AdSpend" (
    "id" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "amountZar" INTEGER NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdSpend_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Business_acquisitionSource_createdAt_idx" ON "Business"("acquisitionSource", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AdSpend_channel_periodStart_periodEnd_key" ON "AdSpend"("channel", "periodStart", "periodEnd");

-- CreateIndex
CREATE INDEX "AdSpend_channel_idx" ON "AdSpend"("channel");

-- CreateIndex
CREATE INDEX "AdSpend_periodStart_idx" ON "AdSpend"("periodStart");
