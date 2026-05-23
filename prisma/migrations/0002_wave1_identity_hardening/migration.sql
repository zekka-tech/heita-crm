ALTER TABLE "User"
ADD COLUMN "phoneVerifiedAt" TIMESTAMP(3);

ALTER TABLE "User"
DROP COLUMN "passwordHash";

CREATE UNIQUE INDEX "Message_channel_externalId_key"
ON "Message"("channel", "externalId");
