-- CreateEnum
CREATE TYPE "DocumentSourceType" AS ENUM ('FILE', 'URL');

-- CreateEnum
CREATE TYPE "WebSourceStatus" AS ENUM ('PENDING', 'CRAWLING', 'READY', 'FAILED');

-- AlterTable
ALTER TABLE "BusinessDocument" ADD COLUMN     "contentHash" TEXT,
ADD COLUMN     "sourceType" "DocumentSourceType" NOT NULL DEFAULT 'FILE',
ADD COLUMN     "webSourceId" TEXT;

-- CreateTable
CREATE TABLE "WebSource" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "rootUrl" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "maxDepth" INTEGER NOT NULL DEFAULT 2,
    "maxPages" INTEGER NOT NULL DEFAULT 25,
    "refreshIntervalDays" INTEGER NOT NULL DEFAULT 0,
    "status" "WebSourceStatus" NOT NULL DEFAULT 'PENDING',
    "lastCrawledAt" TIMESTAMP(3),
    "pageCount" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebSource_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WebSource_businessId_status_idx" ON "WebSource"("businessId", "status");

-- CreateIndex
CREATE INDEX "WebSource_status_lastCrawledAt_idx" ON "WebSource"("status", "lastCrawledAt");

-- CreateIndex
CREATE INDEX "BusinessDocument_webSourceId_idx" ON "BusinessDocument"("webSourceId");

-- AddForeignKey
ALTER TABLE "BusinessDocument" ADD CONSTRAINT "BusinessDocument_webSourceId_fkey" FOREIGN KEY ("webSourceId") REFERENCES "WebSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebSource" ADD CONSTRAINT "WebSource_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "AiWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebSource" ADD CONSTRAINT "WebSource_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
