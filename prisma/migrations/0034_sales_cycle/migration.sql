-- Sales cycle: pipeline stages, sales threads, outbound documents, and staff-approved follow-ups.

-- CreateEnum
CREATE TYPE "SalesThreadStatus" AS ENUM ('OPEN', 'WON', 'LOST', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "FollowUpStatus" AS ENUM ('SCHEDULED', 'DRAFTING', 'AWAITING_APPROVAL', 'APPROVED', 'SENT', 'CANCELLED', 'SKIPPED', 'FAILED');

-- CreateEnum
CREATE TYPE "OutboundDocumentKind" AS ENUM ('QUOTE', 'SALES_ORDER', 'INVOICE', 'PURCHASE_ORDER', 'OTHER');

-- AlterTable
ALTER TABLE "Message" ADD COLUMN "salesThreadId" TEXT;

-- CreateTable
CREATE TABLE "PipelineStage" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "isTerminal" BOOLEAN NOT NULL DEFAULT false,
    "defaultFollowUpHours" INTEGER,
    "autoAdvanceOnReply" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PipelineStage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesThread" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "membershipId" TEXT,
    "userId" TEXT,
    "contactPhone" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "status" "SalesThreadStatus" NOT NULL DEFAULT 'OPEN',
    "preferredChannel" "MessageChannel",
    "valueZar" DECIMAL(12,2),
    "lastCustomerReplyAt" TIMESTAMP(3),
    "lastOutboundAt" TIMESTAMP(3),
    "nextFollowUpAt" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboundDocument" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "salesThreadId" TEXT NOT NULL,
    "kind" "OutboundDocumentKind" NOT NULL,
    "title" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "uploadedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutboundDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FollowUpTask" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "salesThreadId" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "channel" "MessageChannel" NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "status" "FollowUpStatus" NOT NULL DEFAULT 'SCHEDULED',
    "reason" TEXT NOT NULL,
    "aiDraftBody" TEXT,
    "approvedBody" TEXT,
    "approvedByUserId" TEXT,
    "sentMessageId" TEXT,
    "bullJobId" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FollowUpTask_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PipelineStage_businessId_key_key" ON "PipelineStage"("businessId", "key");
CREATE INDEX "PipelineStage_businessId_order_idx" ON "PipelineStage"("businessId", "order");
CREATE INDEX "SalesThread_businessId_status_updatedAt_idx" ON "SalesThread"("businessId", "status", "updatedAt");
CREATE INDEX "SalesThread_businessId_stageId_idx" ON "SalesThread"("businessId", "stageId");
CREATE INDEX "SalesThread_businessId_contactPhone_idx" ON "SalesThread"("businessId", "contactPhone");
CREATE INDEX "SalesThread_nextFollowUpAt_idx" ON "SalesThread"("nextFollowUpAt");
CREATE INDEX "SalesThread_membershipId_idx" ON "SalesThread"("membershipId");
CREATE INDEX "SalesThread_userId_idx" ON "SalesThread"("userId");
CREATE INDEX "SalesThread_createdByUserId_idx" ON "SalesThread"("createdByUserId");
CREATE UNIQUE INDEX "OutboundDocument_storageKey_key" ON "OutboundDocument"("storageKey");
CREATE INDEX "OutboundDocument_businessId_salesThreadId_idx" ON "OutboundDocument"("businessId", "salesThreadId");
CREATE INDEX "OutboundDocument_uploadedByUserId_idx" ON "OutboundDocument"("uploadedByUserId");
CREATE UNIQUE INDEX "FollowUpTask_sentMessageId_key" ON "FollowUpTask"("sentMessageId");
CREATE INDEX "FollowUpTask_businessId_status_dueAt_idx" ON "FollowUpTask"("businessId", "status", "dueAt");
CREATE INDEX "FollowUpTask_salesThreadId_idx" ON "FollowUpTask"("salesThreadId");
CREATE INDEX "FollowUpTask_stageId_idx" ON "FollowUpTask"("stageId");
CREATE INDEX "FollowUpTask_approvedByUserId_idx" ON "FollowUpTask"("approvedByUserId");
CREATE INDEX "Message_salesThreadId_createdAt_idx" ON "Message"("salesThreadId", "createdAt");

-- AddForeignKey
ALTER TABLE "PipelineStage" ADD CONSTRAINT "PipelineStage_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SalesThread" ADD CONSTRAINT "SalesThread_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SalesThread" ADD CONSTRAINT "SalesThread_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SalesThread" ADD CONSTRAINT "SalesThread_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SalesThread" ADD CONSTRAINT "SalesThread_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "PipelineStage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SalesThread" ADD CONSTRAINT "SalesThread_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Message" ADD CONSTRAINT "Message_salesThreadId_fkey" FOREIGN KEY ("salesThreadId") REFERENCES "SalesThread"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OutboundDocument" ADD CONSTRAINT "OutboundDocument_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OutboundDocument" ADD CONSTRAINT "OutboundDocument_salesThreadId_fkey" FOREIGN KEY ("salesThreadId") REFERENCES "SalesThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OutboundDocument" ADD CONSTRAINT "OutboundDocument_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FollowUpTask" ADD CONSTRAINT "FollowUpTask_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FollowUpTask" ADD CONSTRAINT "FollowUpTask_salesThreadId_fkey" FOREIGN KEY ("salesThreadId") REFERENCES "SalesThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FollowUpTask" ADD CONSTRAINT "FollowUpTask_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "PipelineStage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FollowUpTask" ADD CONSTRAINT "FollowUpTask_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FollowUpTask" ADD CONSTRAINT "FollowUpTask_sentMessageId_fkey" FOREIGN KEY ("sentMessageId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill default pipeline stages for existing businesses.
INSERT INTO "PipelineStage" (
  "id", "businessId", "key", "label", "order", "isTerminal", "defaultFollowUpHours", "autoAdvanceOnReply"
)
SELECT
  'stage_' || md5(b."id" || defaults.key),
  b."id",
  defaults.key,
  defaults.label,
  defaults.stage_order,
  defaults.is_terminal,
  defaults.default_follow_up_hours,
  defaults.auto_advance_on_reply
FROM "Business" b
CROSS JOIN (
  VALUES
    ('ENQUIRY', 'Enquiry', 10, false, 24, true),
    ('CONSULTATION', 'Consultation', 20, false, 24, true),
    ('QUOTATION', 'Quotation', 30, false, 48, true),
    ('CONSIDERATION', 'Consideration', 40, false, 72, true),
    ('NEGOTIATION', 'Negotiation', 50, false, 48, true),
    ('PAYMENT', 'Payment', 60, false, 24, true),
    ('CONFIRMATION', 'Confirmation', 70, false, 24, true),
    ('EXECUTION', 'Execution', 80, false, 72, true),
    ('AFTER_SALES', 'After sales', 90, false, 336, true),
    ('WON', 'Won', 100, true, NULL, false),
    ('LOST', 'Lost', 110, true, NULL, false)
) AS defaults(key, label, stage_order, is_terminal, default_follow_up_hours, auto_advance_on_reply)
ON CONFLICT ("businessId", "key") DO NOTHING;
