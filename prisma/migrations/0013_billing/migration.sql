-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'PAST_DUE', 'CANCELLED', 'TRIALING');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('PENDING', 'PAID', 'VOID');

-- CreateTable
CREATE TABLE "BusinessSubscription" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "planId" "BusinessPlanId" NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "yocoCustomerId" TEXT,
    "yocoSubscriptionId" TEXT,
    "currentPeriodStart" TIMESTAMP(3) NOT NULL,
    "currentPeriodEnd" TIMESTAMP(3) NOT NULL,
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessInvoice" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "planId" "BusinessPlanId" NOT NULL,
    "amountZar" INTEGER NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'PENDING',
    "yocoPaymentId" TEXT,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" TIMESTAMP(3),
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessInvoice_pkey" PRIMARY KEY ("id")
);

-- Add foreign keys
ALTER TABLE "BusinessSubscription" ADD CONSTRAINT "BusinessSubscription_businessId_fkey"
    FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BusinessInvoice" ADD CONSTRAINT "BusinessInvoice_businessId_fkey"
    FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex
CREATE UNIQUE INDEX "BusinessSubscription_yocoSubscriptionId_key" ON "BusinessSubscription"("yocoSubscriptionId");
CREATE INDEX "BusinessSubscription_businessId_idx" ON "BusinessSubscription"("businessId");
CREATE INDEX "BusinessSubscription_status_idx" ON "BusinessSubscription"("status");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessInvoice_yocoPaymentId_key" ON "BusinessInvoice"("yocoPaymentId");
CREATE INDEX "BusinessInvoice_businessId_idx" ON "BusinessInvoice"("businessId");
CREATE INDEX "BusinessInvoice_status_idx" ON "BusinessInvoice"("status");
