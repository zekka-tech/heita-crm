-- Add provider-neutral payment columns while preserving the existing Yoco
-- columns for backwards compatibility.
CREATE TYPE "PaymentProvider" AS ENUM ('YOCO', 'STRIPE', 'PAYFAST');

ALTER TABLE "BusinessSubscription"
  ADD COLUMN "provider" "PaymentProvider" NOT NULL DEFAULT 'YOCO',
  ADD COLUMN "providerCustomerId" TEXT,
  ADD COLUMN "providerSubscriptionId" TEXT;

ALTER TABLE "BusinessInvoice"
  ADD COLUMN "provider" "PaymentProvider" NOT NULL DEFAULT 'YOCO',
  ADD COLUMN "providerPaymentId" TEXT;

UPDATE "BusinessSubscription"
SET
  "provider" = 'YOCO',
  "providerCustomerId" = "yocoCustomerId",
  "providerSubscriptionId" = "yocoSubscriptionId";

UPDATE "BusinessInvoice"
SET
  "provider" = 'YOCO',
  "providerPaymentId" = "yocoPaymentId";

CREATE INDEX "BusinessSubscription_provider_idx"
  ON "BusinessSubscription"("provider");

CREATE UNIQUE INDEX "BusinessSubscription_provider_providerSubscriptionId_key"
  ON "BusinessSubscription"("provider", "providerSubscriptionId");

CREATE INDEX "BusinessInvoice_provider_idx"
  ON "BusinessInvoice"("provider");

CREATE UNIQUE INDEX "BusinessInvoice_provider_providerPaymentId_key"
  ON "BusinessInvoice"("provider", "providerPaymentId");
