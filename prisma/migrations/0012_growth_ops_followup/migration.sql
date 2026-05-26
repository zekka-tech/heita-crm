ALTER TYPE "TransactionType" ADD VALUE IF NOT EXISTS 'REFERRAL_BONUS';
ALTER TYPE "JoinChannel" ADD VALUE IF NOT EXISTS 'CSV_IMPORT';
CREATE TYPE "ImportStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

ALTER TABLE "Membership"
ADD COLUMN "referredByCodeId" TEXT,
ADD COLUMN "referralRewardedAt" TIMESTAMP(3);

CREATE TABLE "ReferralCode" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "ownerUserId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ReferralCode_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CustomerImportRun" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "sourceCsv" TEXT,
  "status" "ImportStatus" NOT NULL DEFAULT 'PENDING',
  "totalRows" INTEGER NOT NULL DEFAULT 0,
  "importedRows" INTEGER NOT NULL DEFAULT 0,
  "skippedRows" INTEGER NOT NULL DEFAULT 0,
  "failedRows" INTEGER NOT NULL DEFAULT 0,
  "errorSummary" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "finishedAt" TIMESTAMP(3),

  CONSTRAINT "CustomerImportRun_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ReferralCode_code_key" ON "ReferralCode"("code");
CREATE UNIQUE INDEX "ReferralCode_businessId_ownerUserId_key" ON "ReferralCode"("businessId", "ownerUserId");
CREATE INDEX "ReferralCode_businessId_isActive_idx" ON "ReferralCode"("businessId", "isActive");
CREATE INDEX "Membership_referredByCodeId_idx" ON "Membership"("referredByCodeId");
CREATE INDEX "CustomerImportRun_businessId_createdAt_idx" ON "CustomerImportRun"("businessId", "createdAt");
CREATE INDEX "CustomerImportRun_actorUserId_createdAt_idx" ON "CustomerImportRun"("actorUserId", "createdAt");
CREATE INDEX "CustomerImportRun_status_createdAt_idx" ON "CustomerImportRun"("status", "createdAt");

ALTER TABLE "Membership"
ADD CONSTRAINT "Membership_referredByCodeId_fkey"
FOREIGN KEY ("referredByCodeId") REFERENCES "ReferralCode"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ReferralCode"
ADD CONSTRAINT "ReferralCode_businessId_fkey"
FOREIGN KEY ("businessId") REFERENCES "Business"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ReferralCode"
ADD CONSTRAINT "ReferralCode_ownerUserId_fkey"
FOREIGN KEY ("ownerUserId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CustomerImportRun"
ADD CONSTRAINT "CustomerImportRun_businessId_fkey"
FOREIGN KEY ("businessId") REFERENCES "Business"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CustomerImportRun"
ADD CONSTRAINT "CustomerImportRun_actorUserId_fkey"
FOREIGN KEY ("actorUserId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
