CREATE TABLE "FeatureFlag" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "defaultEnabled" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "FeatureFlag_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FeatureFlagOverride" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "isEnabled" BOOLEAN NOT NULL DEFAULT false,
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "FeatureFlagOverride_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FeatureFlag_key_key" ON "FeatureFlag"("key");
CREATE UNIQUE INDEX "FeatureFlagOverride_businessId_key_key" ON "FeatureFlagOverride"("businessId", "key");
CREATE INDEX "FeatureFlagOverride_businessId_isEnabled_idx" ON "FeatureFlagOverride"("businessId", "isEnabled");
CREATE INDEX "FeatureFlagOverride_key_idx" ON "FeatureFlagOverride"("key");

ALTER TABLE "FeatureFlagOverride" ADD CONSTRAINT "FeatureFlagOverride_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FeatureFlagOverride" ADD CONSTRAINT "FeatureFlagOverride_key_fkey" FOREIGN KEY ("key") REFERENCES "FeatureFlag"("key") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FeatureFlagOverride" ADD CONSTRAINT "FeatureFlagOverride_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
