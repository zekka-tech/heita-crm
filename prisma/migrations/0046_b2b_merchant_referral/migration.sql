-- B2B merchant referral loop: cross-tenant referral tracking + per-business credit ledger.

-- CreateEnum
CREATE TYPE "MerchantReferralStatus" AS ENUM ('PENDING', 'REWARDED', 'VOID');

-- CreateEnum
CREATE TYPE "MerchantCreditType" AS ENUM ('REFERRAL_REWARD', 'INVOICE_APPLIED', 'ADJUSTMENT');

-- CreateTable
CREATE TABLE "MerchantReferralCode" (
    "id" TEXT NOT NULL,
    "ownerBusinessId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MerchantReferralCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MerchantReferral" (
    "id" TEXT NOT NULL,
    "codeId" TEXT NOT NULL,
    "referrerBusinessId" TEXT NOT NULL,
    "referredBusinessId" TEXT NOT NULL,
    "status" "MerchantReferralStatus" NOT NULL DEFAULT 'PENDING',
    "rewardAmountZar" INTEGER NOT NULL DEFAULT 0,
    "convertedAt" TIMESTAMP(3),
    "rewardedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MerchantReferral_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MerchantCreditLedger" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "amountZar" INTEGER NOT NULL,
    "type" "MerchantCreditType" NOT NULL,
    "description" TEXT,
    "referralId" TEXT,
    "invoiceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MerchantCreditLedger_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MerchantReferralCode_ownerBusinessId_key" ON "MerchantReferralCode"("ownerBusinessId");

-- CreateIndex
CREATE UNIQUE INDEX "MerchantReferralCode_code_key" ON "MerchantReferralCode"("code");

-- CreateIndex
CREATE UNIQUE INDEX "MerchantReferral_referredBusinessId_key" ON "MerchantReferral"("referredBusinessId");

-- CreateIndex
CREATE INDEX "MerchantReferral_referrerBusinessId_idx" ON "MerchantReferral"("referrerBusinessId");

-- CreateIndex
CREATE INDEX "MerchantReferral_status_idx" ON "MerchantReferral"("status");

-- CreateIndex
CREATE INDEX "MerchantCreditLedger_businessId_createdAt_idx" ON "MerchantCreditLedger"("businessId", "createdAt");

-- AddForeignKey
ALTER TABLE "MerchantReferralCode" ADD CONSTRAINT "MerchantReferralCode_ownerBusinessId_fkey" FOREIGN KEY ("ownerBusinessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchantReferral" ADD CONSTRAINT "MerchantReferral_codeId_fkey" FOREIGN KEY ("codeId") REFERENCES "MerchantReferralCode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchantReferral" ADD CONSTRAINT "MerchantReferral_referrerBusinessId_fkey" FOREIGN KEY ("referrerBusinessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchantReferral" ADD CONSTRAINT "MerchantReferral_referredBusinessId_fkey" FOREIGN KEY ("referredBusinessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchantCreditLedger" ADD CONSTRAINT "MerchantCreditLedger_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS: MerchantCreditLedger is per-business and money-bearing. Enable FORCE RLS
-- with a business-scope policy (a merchant reads/consumes its own credit) plus a
-- system-scope policy (cross-tenant settlement credits the referrer business).
ALTER TABLE "MerchantCreditLedger" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MerchantCreditLedger" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "MerchantCreditLedger_business_scope" ON "MerchantCreditLedger";
CREATE POLICY "MerchantCreditLedger_business_scope" ON "MerchantCreditLedger"
  FOR ALL
  USING ("businessId" = current_setting('app.current_business_id', true)::text)
  WITH CHECK ("businessId" = current_setting('app.current_business_id', true)::text);

DROP POLICY IF EXISTS "MerchantCreditLedger_system_scope" ON "MerchantCreditLedger";
CREATE POLICY "MerchantCreditLedger_system_scope" ON "MerchantCreditLedger"
  FOR ALL
  USING (current_setting('app.system_scope', true) = 'on')
  WITH CHECK (current_setting('app.system_scope', true) = 'on');
