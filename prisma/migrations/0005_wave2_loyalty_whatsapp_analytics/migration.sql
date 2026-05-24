ALTER TABLE "Business"
ADD COLUMN "pointsExpiryDays" INTEGER NOT NULL DEFAULT 365;

ALTER TABLE "Message"
ADD COLUMN "contactPhone" TEXT,
ADD COLUMN "status" TEXT;

ALTER TABLE "LoyaltyTransaction"
ADD COLUMN "expiresAt" TIMESTAMP(3),
ADD COLUMN "refundSourceId" TEXT,
ADD COLUMN "expirySourceId" TEXT;

CREATE TABLE "MessageAttachment" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "mediaType" TEXT NOT NULL,
    "mimeType" TEXT,
    "fileName" TEXT,
    "byteSize" INTEGER,
    "externalMediaId" TEXT,
    "storageKey" TEXT,
    "sourceUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageAttachment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Message_businessId_contactPhone_createdAt_idx" ON "Message"("businessId", "contactPhone", "createdAt");
CREATE INDEX "LoyaltyTransaction_expiresAt_idx" ON "LoyaltyTransaction"("expiresAt");
CREATE INDEX "MessageAttachment_messageId_createdAt_idx" ON "MessageAttachment"("messageId", "createdAt");
CREATE INDEX "MessageAttachment_externalMediaId_idx" ON "MessageAttachment"("externalMediaId");

CREATE UNIQUE INDEX "LoyaltyTransaction_refundSourceId_key" ON "LoyaltyTransaction"("refundSourceId");
CREATE UNIQUE INDEX "LoyaltyTransaction_expirySourceId_key" ON "LoyaltyTransaction"("expirySourceId");

ALTER TABLE "LoyaltyTransaction"
ADD CONSTRAINT "LoyaltyTransaction_refundSourceId_fkey"
FOREIGN KEY ("refundSourceId") REFERENCES "LoyaltyTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "LoyaltyTransaction"
ADD CONSTRAINT "LoyaltyTransaction_expirySourceId_fkey"
FOREIGN KEY ("expirySourceId") REFERENCES "LoyaltyTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "MessageAttachment"
ADD CONSTRAINT "MessageAttachment_messageId_fkey"
FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;
