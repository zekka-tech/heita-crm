import { StaffRole } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const prisma = {
  $transaction: vi.fn(),
  membership: {
    findUniqueOrThrow: vi.fn(),
    update: vi.fn(),
    findMany: vi.fn()
  },
  loyaltyTransaction: {
    create: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    findFirstOrThrow: vi.fn(),
    findMany: vi.fn()
  },
  ocrReceipt: {
    create: vi.fn()
  },
  notification: {
    create: vi.fn()
  },
  staffMember: {
    findUnique: vi.fn().mockResolvedValue({ role: StaffRole.MANAGER })
  },
  reward: {
    findFirstOrThrow: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn()
  },
  staffAuditLog: { create: vi.fn() }
};

const redisMock = {
  set: vi.fn().mockResolvedValue("OK"),
  get: vi.fn().mockResolvedValue(null),
  del: vi.fn().mockResolvedValue(1)
};

const withBusinessScope = vi.fn(
  async (_businessId: string, fn: (tx: typeof prisma) => Promise<unknown>) =>
    fn(prisma)
);

vi.mock("@/lib/prisma", () => ({ prisma, withBusinessScope }));
vi.mock("@/lib/redis", () => ({ getRedis: () => redisMock }));
vi.mock("@/server/services/referral.service", () => ({
  applyReferralRewardIfEligible: vi.fn().mockResolvedValue(null)
}));
vi.mock("@/server/services/staff-audit.service", () => ({
  recordStaffAuditLog: vi.fn().mockResolvedValue(undefined)
}));
vi.mock("@/lib/data-cache", () => ({
  analyticsKeysForBusiness: () => [],
  cacheDel: vi.fn().mockResolvedValue(undefined)
}));
vi.mock("@/lib/telemetry", () => ({
  captureEvent: vi.fn()
}));
vi.mock("@/lib/tracing", () => ({
  withSpan: vi.fn((_name: string, _attrs: unknown, fn: () => Promise<unknown>) => fn())
}));
vi.mock("@/server/services/notification.service", () => ({
  sendNotification: vi.fn().mockResolvedValue(undefined)
}));

describe("offline sync API processing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    withBusinessScope.mockImplementation(
      async (_businessId: string, fn: (tx: typeof prisma) => Promise<unknown>) =>
        fn(prisma)
    );
    prisma.staffMember.findUnique.mockResolvedValue({
      role: StaffRole.MANAGER
    });
    prisma.membership.findUniqueOrThrow.mockResolvedValue({
      id: "mem_1",
      businessId: "biz_1",
      userId: "user_1",
      pointsBalance: 200,
      tierId: null,
      isActive: true,
      referredByCodeId: null,
      referralRewardedAt: null,
      referredByCode: null,
      tier: null,
      user: { id: "user_1", name: "Alice" },
      business: {
        id: "biz_1",
        name: "Test Business",
        slug: "test-biz",
        pointsExpiryDays: 365,
        loyaltyTiers: []
      }
    });
    prisma.membership.update.mockResolvedValue({
      id: "mem_1",
      businessId: "biz_1",
      userId: "user_1",
      pointsBalance: 250,
      tierId: null,
      isActive: true
    });
  });

  it("validates idempotency keys skip duplicates", async () => {
    redisMock.get.mockResolvedValueOnce("1");

    const { runIdempotentOperation } = await import("@/lib/idempotency");

    const replayFn = vi.fn().mockResolvedValue({ id: "mem_1", pointsBalance: 250 });
    const result = await runIdempotentOperation({
      scope: "test:offline",
      key: "idem-001",
      execute: vi.fn().mockResolvedValue({ id: "mem_1" }),
      replay: replayFn
    });

    expect(replayFn).toHaveBeenCalledTimes(1);
    expect(result).toBeDefined();
  });

  it("earnPoints rejects negative points", async () => {
    const { earnPoints } = await import("@/server/services/loyalty.service");

    await expect(
      earnPoints({
        businessId: "biz_1",
        membershipId: "mem_1",
        points: -10,
        actorUserId: "user_1",
        idempotencyKey: "idem-neg"
      })
    ).rejects.toThrow("Points to earn must be greater than zero");
  });

  it("earnPoints processes valid input", async () => {
    const { earnPoints } = await import("@/server/services/loyalty.service");

    const result = await earnPoints({
      businessId: "biz_1",
      membershipId: "mem_1",
      points: 50,
      actorUserId: "user_1",
      idempotencyKey: "idem-valid-001"
    });

    expect(result).toBeDefined();
    expect(prisma.membership.update).toHaveBeenCalled();
  });

  it("ocrReceipt creation is idempotent", async () => {
    redisMock.get.mockResolvedValueOnce("1");

    const { runIdempotentOperation } = await import("@/lib/idempotency");

    const replayFn = vi.fn().mockResolvedValue(undefined);
    await runIdempotentOperation({
      scope: "offline:scan_receipt:biz_1",
      key: "idem-receipt-001",
      execute: vi.fn().mockResolvedValue(undefined),
      replay: replayFn
    });

    expect(replayFn).toHaveBeenCalled();
  });
});
