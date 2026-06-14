import { beforeEach, describe, expect, it, vi } from "vitest";

const mockTx = {
  featureFlag: { upsert: vi.fn() },
  featureFlagOverride: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    upsert: vi.fn()
  },
  staffAuditLog: { create: vi.fn() }
};

const withBusinessScope = vi.fn((businessId: string, fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx));

const prisma = {
  featureFlag: { createMany: vi.fn(), findUnique: vi.fn() },
  featureFlagOverride: { findMany: vi.fn(), findUnique: vi.fn() }
};

const redis = {
  get: vi.fn(),
  setex: vi.fn(),
  del: vi.fn()
};

vi.mock("@/lib/prisma", () => ({ prisma, withBusinessScope }));
vi.mock("@/lib/redis", () => ({ getRedis: vi.fn(() => redis) }));
vi.mock("@/lib/staff", () => ({ requireRole: vi.fn().mockResolvedValue({ role: "OWNER" }) }));

const audit = vi.hoisted(() => ({ recordStaffAuditLog: vi.fn().mockResolvedValue({}) }));
vi.mock("@/server/services/staff-audit.service", () => audit);

const { isFeatureEnabled } = await import("@/lib/feature-flags");
const { requireRole } = await import("@/lib/staff");
const {
  listBusinessFeatureFlags,
  seedFeatureFlagDefaults,
  setBusinessFeatureFlag
} = await import("@/server/services/feature-flag.service");

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.FEATURE_FLAG_NATIVE_COMMS;
  delete process.env.HEITA_FEATURE_FLAGS;
  redis.get.mockResolvedValue(null);
  redis.setex.mockResolvedValue("OK");
  redis.del.mockResolvedValue(1);
  prisma.featureFlag.findUnique.mockResolvedValue(null);
  prisma.featureFlagOverride.findUnique.mockResolvedValue(null);
  mockTx.featureFlagOverride.findMany.mockResolvedValue([]);
  mockTx.featureFlagOverride.findUnique.mockResolvedValue(null);
  prisma.featureFlag.createMany.mockResolvedValue({ count: 4 });
  mockTx.featureFlag.upsert.mockResolvedValue({});
  mockTx.featureFlagOverride.upsert.mockResolvedValue({ id: "ffo_1" });
  mockTx.staffAuditLog.create.mockResolvedValue({ id: "audit_1" });
});

describe("isFeatureEnabled", () => {
  it("returns the business override when present", async () => {
    mockTx.featureFlagOverride.findUnique.mockResolvedValue({ isEnabled: true });

    await expect(isFeatureEnabled("nativeComms", { businessId: "biz1" })).resolves.toBe(true);

    expect(withBusinessScope).toHaveBeenCalledWith("biz1", expect.any(Function));
    expect(mockTx.featureFlagOverride.findUnique).toHaveBeenCalledWith({
      where: { businessId_key: { businessId: "biz1", key: "nativeComms" } },
      select: { isEnabled: true }
    });
    expect(prisma.featureFlagOverride.findUnique).not.toHaveBeenCalled();
    expect(redis.setex).toHaveBeenCalledWith("feature-flag:nativeComms:biz1", 60, "1");
  });

  it("uses registry defaults when no database default exists", async () => {
    await expect(isFeatureEnabled("nativeComms")).resolves.toBe(false);
    await expect(isFeatureEnabled("whatsappPrimary")).resolves.toBe(true);
  });

  it("uses environment defaults before database defaults", async () => {
    process.env.FEATURE_FLAG_NATIVE_COMMS = "true";
    prisma.featureFlag.findUnique.mockResolvedValue({ defaultEnabled: false });

    await expect(isFeatureEnabled("nativeComms")).resolves.toBe(true);
    expect(prisma.featureFlag.findUnique).not.toHaveBeenCalled();
  });

  it("uses cached values before querying Postgres", async () => {
    redis.get.mockResolvedValue("1");

    await expect(isFeatureEnabled("nativeComms", { businessId: "biz1" })).resolves.toBe(true);
    expect(mockTx.featureFlagOverride.findUnique).not.toHaveBeenCalled();
    expect(prisma.featureFlagOverride.findUnique).not.toHaveBeenCalled();
    expect(prisma.featureFlag.findUnique).not.toHaveBeenCalled();
    expect(withBusinessScope).not.toHaveBeenCalled();
  });
});

describe("feature flag service", () => {
  it("seeds registry defaults idempotently", async () => {
    await seedFeatureFlagDefaults();

    expect(prisma.featureFlag.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skipDuplicates: true,
        data: expect.arrayContaining([
          expect.objectContaining({ key: "nativeComms", defaultEnabled: false }),
          expect.objectContaining({ key: "whatsappPrimary", defaultEnabled: true })
        ])
      })
    );
  });

  it("lists business flags from an RLS-scoped override read", async () => {
    mockTx.featureFlagOverride.findMany.mockResolvedValue([
      { key: "nativeComms", isEnabled: true, updatedAt: new Date("2026-01-01T00:00:00.000Z") }
    ]);
    mockTx.featureFlagOverride.findUnique.mockResolvedValue({ isEnabled: true });

    const flags = await listBusinessFeatureFlags({ businessId: "biz1" });

    expect(withBusinessScope).toHaveBeenCalledWith("biz1", expect.any(Function));
    expect(mockTx.featureFlagOverride.findMany).toHaveBeenCalledWith({
      where: { businessId: "biz1" },
      select: { key: true, isEnabled: true, updatedAt: true },
      orderBy: { key: "asc" }
    });
    expect(flags.find((flag) => flag.key === "nativeComms")).toEqual(
      expect.objectContaining({ enabled: true, overrideEnabled: true })
    );
  });

  it("rejects unknown flag keys", async () => {
    await expect(
      setBusinessFeatureFlag({
        businessId: "biz1",
        actorUserId: "user1",
        key: "unknownFlag",
        isEnabled: true
      })
    ).rejects.toThrow(/Unknown feature flag/);
    expect(requireRole).not.toHaveBeenCalled();
  });

  it("requires OWNER role, upserts the override, records audit, and clears cache", async () => {
    await setBusinessFeatureFlag({
      businessId: "biz1",
      actorUserId: "user1",
      key: "nativeComms",
      isEnabled: true
    });

    expect(requireRole).toHaveBeenCalledWith({
      businessId: "biz1",
      userId: "user1",
      allowedRoles: ["OWNER"]
    });
    expect(mockTx.featureFlagOverride.upsert).toHaveBeenCalledWith({
      where: { businessId_key: { businessId: "biz1", key: "nativeComms" } },
      create: {
        businessId: "biz1",
        key: "nativeComms",
        isEnabled: true,
        updatedById: "user1"
      },
      update: { isEnabled: true, updatedById: "user1" }
    });
    expect(audit.recordStaffAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "business.feature_flag.update",
        targetType: "FeatureFlagOverride",
        metadata: { key: "nativeComms", isEnabled: true }
      }),
      mockTx
    );
    expect(redis.del).toHaveBeenCalledWith("feature-flag:nativeComms:biz1");
    expect(redis.del).toHaveBeenCalledWith("feature-flag:nativeComms:global");
  });
});
