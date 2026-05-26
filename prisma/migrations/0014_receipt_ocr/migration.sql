-- CreateEnum
CREATE TYPE "OcrReceiptStatus" AS ENUM ('PENDING_REVIEW', 'APPROVED', 'REJECTED', 'PROCESSED');

-- CreateTable
CREATE TABLE "OcrReceipt" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "membershipId" TEXT,
    "imageUrl" TEXT NOT NULL,
    "rawOcrText" TEXT,
    "parsedTotal" DOUBLE PRECISION,
    "parsedBusiness" TEXT,
    "pointsToAward" INTEGER,
    "status" "OcrReceiptStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "reviewedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,
    "transactionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OcrReceipt_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "OcrReceipt" ADD CONSTRAINT "OcrReceipt_businessId_fkey"
    FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OcrReceipt" ADD CONSTRAINT "OcrReceipt_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "OcrReceipt_businessId_status_idx" ON "OcrReceipt"("businessId", "status");
CREATE INDEX "OcrReceipt_userId_idx" ON "OcrReceipt"("userId");
