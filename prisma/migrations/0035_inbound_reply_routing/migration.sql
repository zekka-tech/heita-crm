-- Add tenant-scoped inbound channel addresses for provider shortcodes, long codes,
-- and reply addresses. This is additive and does not change existing routing.
CREATE TABLE "BusinessInboundAddress" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "channel" "MessageChannel" NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'africas-talking',
    "address" TEXT NOT NULL,
    "label" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessInboundAddress_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "BusinessInboundAddress"
ADD CONSTRAINT "BusinessInboundAddress_businessId_fkey"
FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "BusinessInboundAddress_channel_provider_address_key"
ON "BusinessInboundAddress"("channel", "provider", "address");

CREATE INDEX "BusinessInboundAddress_businessId_channel_isActive_idx"
ON "BusinessInboundAddress"("businessId", "channel", "isActive");
