import { StaffRole } from "@prisma/client";

import {
  FEATURE_FLAGS,
  assertFeatureFlagKey,
  invalidateFeatureFlagCache,
  isFeatureEnabled,
  type FeatureFlagKey
} from "@/lib/feature-flags";
import { prisma, withBusinessScope } from "@/lib/prisma";
import { requireRole } from "@/lib/staff";
import { recordStaffAuditLog } from "@/server/services/staff-audit.service";


export async function seedFeatureFlagDefaults() {
  return prisma.featureFlag.createMany({
    data: Object.values(FEATURE_FLAGS).map((flag) => ({
      key: flag.key,
      label: flag.label,
      description: flag.description,
      defaultEnabled: flag.defaultEnabled
    })),
    skipDuplicates: true
  });
}

export async function listBusinessFeatureFlags(input: { businessId: string }) {
  const overrides = await withBusinessScope(input.businessId, (tx) => {
    return tx.featureFlagOverride.findMany({
      where: { businessId: input.businessId },
      select: { key: true, isEnabled: true, updatedAt: true },
      orderBy: { key: "asc" }
    });
  });
  const overrideByKey = new Map(overrides.map((override) => [override.key, override]));

  return Promise.all(
    Object.values(FEATURE_FLAGS).map(async (flag) => {
      const override = overrideByKey.get(flag.key);
      const enabled = await isFeatureEnabled(flag.key, { businessId: input.businessId });
      return {
        key: flag.key,
        label: flag.label,
        description: flag.description,
        enabled,
        overrideEnabled: override?.isEnabled ?? null,
        updatedAt: override?.updatedAt ?? null
      };
    })
  );
}

export async function setBusinessFeatureFlag(input: {
  businessId: string;
  actorUserId: string;
  key: FeatureFlagKey | string;
  isEnabled: boolean;
}) {
  assertFeatureFlagKey(input.key);

  await requireRole({
    businessId: input.businessId,
    userId: input.actorUserId,
    allowedRoles: [StaffRole.OWNER]
  });

  const flag = FEATURE_FLAGS[input.key];
  const row = await withBusinessScope(input.businessId, async (tx) => {
    await tx.featureFlag.upsert({
      where: { key: input.key },
      create: {
        key: flag.key,
        label: flag.label,
        description: flag.description,
        defaultEnabled: flag.defaultEnabled
      },
      update: {
        label: flag.label,
        description: flag.description
      }
    });

    const override = await tx.featureFlagOverride.upsert({
      where: { businessId_key: { businessId: input.businessId, key: input.key } },
      create: {
        businessId: input.businessId,
        key: input.key,
        isEnabled: input.isEnabled,
        updatedById: input.actorUserId
      },
      update: {
        isEnabled: input.isEnabled,
        updatedById: input.actorUserId
      }
    });

    await recordStaffAuditLog(
      {
        businessId: input.businessId,
        actorUserId: input.actorUserId,
        action: "business.feature_flag.update",
        targetType: "FeatureFlagOverride",
        targetId: override.id,
        metadata: { key: input.key, isEnabled: input.isEnabled }
      },
      tx
    );

    return override;
  });

  await invalidateFeatureFlagCache(input.key, input.businessId);
  return row;
}
