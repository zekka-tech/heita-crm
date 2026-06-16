-- Reach-packs: purchasable bundles of extra outbound-message volume.

-- AlterEnum: new credit-ledger type for reach-pack purchases paid with credit.
ALTER TYPE "MerchantCreditType" ADD VALUE 'REACH_PACK';

-- CreateEnum
CREATE TYPE "MessagePackGroup" AS ENUM ('WHATSAPP', 'IN_APP');

-- CreateEnum
CREATE TYPE "MessagePackSource" AS ENUM ('CREDIT', 'PURCHASE', 'ADMIN');

-- CreateTable
CREATE TABLE "MessagePack" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "group" "MessagePackGroup" NOT NULL,
    "units" INTEGER NOT NULL,
    "source" "MessagePackSource" NOT NULL DEFAULT 'CREDIT',
    "invoiceId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessagePack_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MessagePack_businessId_group_expiresAt_idx" ON "MessagePack"("businessId", "group", "expiresAt");

-- AddForeignKey
ALTER TABLE "MessagePack" ADD CONSTRAINT "MessagePack_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS: MessagePack is per-business. Enable FORCE RLS with a business-scope policy
-- (a merchant reads/buys its own packs) plus a system-scope policy for reporting.
ALTER TABLE "MessagePack" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MessagePack" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "MessagePack_business_scope" ON "MessagePack";
CREATE POLICY "MessagePack_business_scope" ON "MessagePack"
  FOR ALL
  USING ("businessId" = current_setting('app.current_business_id', true)::text)
  WITH CHECK ("businessId" = current_setting('app.current_business_id', true)::text);

DROP POLICY IF EXISTS "MessagePack_system_scope" ON "MessagePack";
CREATE POLICY "MessagePack_system_scope" ON "MessagePack"
  FOR ALL
  USING (current_setting('app.system_scope', true) = 'on')
  WITH CHECK (current_setting('app.system_scope', true) = 'on');
