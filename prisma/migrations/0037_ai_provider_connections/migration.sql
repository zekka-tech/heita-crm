-- Bring-your-own-model (BYOM) provider connections: businesses can store an
-- encrypted API key for an external LLM provider and select it as the brain
-- of their AI co-worker.

CREATE TYPE "AiProvider" AS ENUM ('ANTHROPIC', 'OPENAI', 'GOOGLE', 'DEEPSEEK', 'MINIMAX', 'KIMI', 'QWEN', 'CUSTOM');

CREATE TYPE "AiProviderConnectionStatus" AS ENUM ('UNVERIFIED', 'ACTIVE', 'INVALID', 'DISABLED');

CREATE TABLE "AiProviderConnection" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "provider" "AiProvider" NOT NULL,
  "label" TEXT,
  "baseUrl" TEXT,
  "encryptedApiKey" TEXT NOT NULL,
  "keyLast4" TEXT NOT NULL,
  "chatModel" TEXT NOT NULL,
  "status" "AiProviderConnectionStatus" NOT NULL DEFAULT 'UNVERIFIED',
  "lastValidatedAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AiProviderConnection_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AiProviderConnection_businessId_createdAt_idx"
  ON "AiProviderConnection"("businessId", "createdAt");

ALTER TABLE "AiProviderConnection"
  ADD CONSTRAINT "AiProviderConnection_businessId_fkey"
  FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AiProviderConnection"
  ADD CONSTRAINT "AiProviderConnection_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AiWorkspace" ADD COLUMN "activeConnectionId" TEXT;

CREATE UNIQUE INDEX "AiWorkspace_activeConnectionId_key"
  ON "AiWorkspace"("activeConnectionId");

ALTER TABLE "AiWorkspace"
  ADD CONSTRAINT "AiWorkspace_activeConnectionId_fkey"
  FOREIGN KEY ("activeConnectionId") REFERENCES "AiProviderConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
