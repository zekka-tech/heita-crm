-- AlterTable
ALTER TABLE "Business" ADD COLUMN "parentBusinessId" TEXT;
ALTER TABLE "Business" ADD COLUMN "isFranchiseHQ" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "CustomerSegment" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "rules" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerSegment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Business_parentBusinessId_idx" ON "Business"("parentBusinessId");

-- CreateIndex
CREATE INDEX "CustomerSegment_businessId_isActive_idx" ON "CustomerSegment"("businessId", "isActive");

-- AddForeignKey
ALTER TABLE "CustomerSegment" ADD CONSTRAINT "CustomerSegment_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Business" ADD CONSTRAINT "Business_parentBusinessId_fkey" FOREIGN KEY ("parentBusinessId") REFERENCES "Business"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterEnum
ALTER TYPE "StaffRole" ADD VALUE 'FRANCHISE_ADMIN';
