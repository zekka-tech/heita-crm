CREATE TYPE "BusinessPlanId" AS ENUM ('FREE', 'GROWTH', 'SCALE');

ALTER TABLE "Business"
ADD COLUMN "planId" "BusinessPlanId" NOT NULL DEFAULT 'FREE';

CREATE TABLE "AiTokenUsage" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "sessionId" TEXT,
  "userId" TEXT,
  "runtime" TEXT NOT NULL,
  "model" TEXT,
  "messageUnits" INTEGER NOT NULL DEFAULT 1,
  "promptTokens" INTEGER,
  "completionTokens" INTEGER,
  "totalTokens" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AiTokenUsage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StaffAuditLog" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "targetType" TEXT NOT NULL,
  "targetId" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "StaffAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AiTokenUsage_businessId_createdAt_idx"
ON "AiTokenUsage"("businessId", "createdAt");

CREATE INDEX "AiTokenUsage_sessionId_createdAt_idx"
ON "AiTokenUsage"("sessionId", "createdAt");

CREATE INDEX "StaffAuditLog_businessId_createdAt_idx"
ON "StaffAuditLog"("businessId", "createdAt");

CREATE INDEX "StaffAuditLog_actorUserId_createdAt_idx"
ON "StaffAuditLog"("actorUserId", "createdAt");

CREATE INDEX "StaffAuditLog_targetType_targetId_idx"
ON "StaffAuditLog"("targetType", "targetId");

ALTER TABLE "AiTokenUsage"
ADD CONSTRAINT "AiTokenUsage_businessId_fkey"
FOREIGN KEY ("businessId") REFERENCES "Business"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AiTokenUsage"
ADD CONSTRAINT "AiTokenUsage_sessionId_fkey"
FOREIGN KEY ("sessionId") REFERENCES "AiChatSession"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AiTokenUsage"
ADD CONSTRAINT "AiTokenUsage_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "StaffAuditLog"
ADD CONSTRAINT "StaffAuditLog_businessId_fkey"
FOREIGN KEY ("businessId") REFERENCES "Business"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StaffAuditLog"
ADD CONSTRAINT "StaffAuditLog_actorUserId_fkey"
FOREIGN KEY ("actorUserId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
