ALTER TABLE "AiChatMessage"
ADD COLUMN "model" TEXT,
ADD COLUMN "latencyMs" INTEGER,
ADD COLUMN "promptTokens" INTEGER,
ADD COLUMN "completionTokens" INTEGER,
ADD COLUMN "metadata" JSONB;
