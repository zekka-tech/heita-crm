ALTER TYPE "OtpPurpose" ADD VALUE IF NOT EXISTS 'STAFF_STEP_UP';

CREATE TYPE "ConsentType" AS ENUM (
  'TERMS_OF_SERVICE',
  'PRIVACY_POLICY',
  'COOKIE_PREFERENCES',
  'WHATSAPP_MARKETING'
);

CREATE TYPE "ConsentChannel" AS ENUM ('WEB', 'WHATSAPP', 'SMS', 'EMAIL');

ALTER TABLE "User"
ADD COLUMN "deletedAt" TIMESTAMP(3);

ALTER TABLE "Business"
ADD COLUMN "deletedAt" TIMESTAMP(3);

CREATE TABLE "UserConsent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "businessId" TEXT,
    "type" "ConsentType" NOT NULL,
    "channel" "ConsentChannel" NOT NULL,
    "source" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "UserConsent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "UserConsent_userId_type_grantedAt_idx"
ON "UserConsent"("userId", "type", "grantedAt");

CREATE INDEX "UserConsent_businessId_type_idx"
ON "UserConsent"("businessId", "type");

ALTER TABLE "UserConsent"
ADD CONSTRAINT "UserConsent_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserConsent"
ADD CONSTRAINT "UserConsent_businessId_fkey"
FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE SET NULL ON UPDATE CASCADE;
