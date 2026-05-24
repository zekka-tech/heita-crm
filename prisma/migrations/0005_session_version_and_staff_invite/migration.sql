-- A-06 Session revocation: increment on logout-everywhere / role changes / etc.
ALTER TABLE "User"
ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;

-- A-05 Staff invites
CREATE TYPE "StaffInviteStatus" AS ENUM (
  'PENDING',
  'ACCEPTED',
  'REVOKED',
  'EXPIRED'
);

CREATE TABLE "StaffInvite" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "role" "StaffRole" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "invitedById" TEXT NOT NULL,
    "status" "StaffInviteStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "acceptedById" TEXT,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffInvite_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StaffInvite_tokenHash_key"
  ON "StaffInvite"("tokenHash");

CREATE INDEX "StaffInvite_businessId_status_idx"
  ON "StaffInvite"("businessId", "status");

CREATE INDEX "StaffInvite_email_idx"
  ON "StaffInvite"("email");

CREATE INDEX "StaffInvite_phone_idx"
  ON "StaffInvite"("phone");

ALTER TABLE "StaffInvite"
ADD CONSTRAINT "StaffInvite_businessId_fkey"
FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE;

ALTER TABLE "StaffInvite"
ADD CONSTRAINT "StaffInvite_invitedById_fkey"
FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE CASCADE;
