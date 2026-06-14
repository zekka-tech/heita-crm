-- CreateEnum
CREATE TYPE "ConversationStatus" AS ENUM ('ACTIVE', 'ARCHIVED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "ParticipantRole" AS ENUM ('OWNER', 'AGENT', 'MEMBER');

-- CreateTable
CREATE TABLE "Conversation" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "subject" TEXT,
  "channel" "MessageChannel" NOT NULL DEFAULT 'IN_APP',
  "status" "ConversationStatus" NOT NULL DEFAULT 'ACTIVE',
  "lastMessageAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationParticipant" (
  "id" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" "ParticipantRole" NOT NULL DEFAULT 'MEMBER',
  "lastReadAt" TIMESTAMP(3),
  "isTyping" BOOLEAN NOT NULL DEFAULT false,
  "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ConversationParticipant_pkey" PRIMARY KEY ("id")
);

-- AlterTable: add new columns to Message
ALTER TABLE "Message" ADD COLUMN "conversationId" TEXT;
ALTER TABLE "Message" ADD COLUMN "deliveredAt" TIMESTAMP(3);
ALTER TABLE "Message" ADD COLUMN "readAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Conversation_businessId_status_idx" ON "Conversation"("businessId", "status");
CREATE INDEX "Conversation_customerId_idx" ON "Conversation"("customerId");
CREATE INDEX "Conversation_lastMessageAt_idx" ON "Conversation"("lastMessageAt");
CREATE UNIQUE INDEX "ConversationParticipant_conversationId_userId_key" ON "ConversationParticipant"("conversationId", "userId");
CREATE INDEX "Message_conversationId_createdAt_idx" ON "Message"("conversationId", "createdAt");

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConversationParticipant" ADD CONSTRAINT "ConversationParticipant_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConversationParticipant" ADD CONSTRAINT "ConversationParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RLS enablement for new business-scoped tables
ALTER TABLE "Conversation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Conversation" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Conversation_business_scope" ON "Conversation";
CREATE POLICY "Conversation_business_scope" ON "Conversation"
  FOR ALL
  USING ("businessId" = current_setting('app.current_business_id', true)::text)
  WITH CHECK ("businessId" = current_setting('app.current_business_id', true)::text);

ALTER TABLE "ConversationParticipant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ConversationParticipant" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ConversationParticipant_business_scope" ON "ConversationParticipant";
CREATE POLICY "ConversationParticipant_business_scope" ON "ConversationParticipant"
  FOR ALL
  USING (
    "conversationId" IN (
      SELECT "id" FROM "Conversation"
      WHERE "businessId" = current_setting('app.current_business_id', true)::text
    )
  )
  WITH CHECK (
    "conversationId" IN (
      SELECT "id" FROM "Conversation"
      WHERE "businessId" = current_setting('app.current_business_id', true)::text
    )
  );
