import { beforeEach, describe, expect, it, vi } from "vitest";

const mockTx = {
  businessInvoice: { findFirst: vi.fn(), create: vi.fn() },
  businessSubscription: { create: vi.fn() },
  business: { update: vi.fn() }
};

const prisma = {
  $transaction: vi.fn((fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx)),
  business: { findUnique: vi.fn() },
  businessSubscription: { findFirst: vi.fn(), updateMany: vi.fn() },
  membership: { count: vi.fn() },
  staffMember: { count: vi.fn() },
  aiTokenUsage: { count: vi.fn() },
  businessDocument: { count: vi.fn() }
};

vi.mock("@/lib/prisma", () => ({ prisma }));
vi.mock("@/server/services/staff-audit.service", () => ({
  recordStaffAuditLog: vi.fn().mockResolvedValue(undefined)
}));

const {
  checkPlanLimit,
  getEffectivePlan,
  handleYocoWebhook,
  isPaidBusinessPlan,
  requirePaidBusinessPlan
} = await import("@/server/services/billing.service");

beforeEach(() => {
  vi.clearAllMocks();
  mockTx.businessInvoice.findFirst.mockResolvedValue(null);
  mockTx.businessInvoice.create.mockResolvedValue({});
  mockTx.businessSubscription.create.mockResolvedValue({});
  mockTx.business.update.mockResolvedValue({});
});

describe("getEffectivePlan", () => {
  it("returns business planId when found", async () => {
    prisma.business.findUnique.mockResolvedValue({ planId: "PROFESSIONAL" });
    await expect(getEffectivePlan("biz1")).resolves.toBe("PROFESSIONAL");
  });

  it("falls back to FREE when business not found", async () => {
    prisma.business.findUnique.mockResolvedValue(null);
    await expect(getEffectivePlan("unknown")).resolves.toBe("FREE");
  });
});

describe("paid-plan feature gating", () => {
  it("identifies Growth and Scale as paid plans", () => {
    expect(isPaidBusinessPlan("FREE")).toBe(false);
    expect(isPaidBusinessPlan("GROWTH")).toBe(true);
    expect(isPaidBusinessPlan("SCALE")).toBe(true);
  });

  it("rejects paid-only features on Free", async () => {
    prisma.business.findUnique.mockResolvedValue({ planId: "FREE" });
    await expect(requirePaidBusinessPlan("biz1", "Sales pipeline")).rejects.toThrow(/paid plans only/);
  });

  it("allows paid-only features on Growth", async () => {
    prisma.business.findUnique.mockResolvedValue({ planId: "GROWTH" });
    await expect(requirePaidBusinessPlan("biz1", "Sales pipeline")).resolves.toBe("GROWTH");
  });
});

describe("checkPlanLimit", () => {
  it("reports allowed=true when under the member limit", async () => {
    prisma.business.findUnique.mockResolvedValue({ planId: "FREE" });
    prisma.membership.count.mockResolvedValue(50);
    const result = await checkPlanLimit("biz1", "members");
    expect(result.allowed).toBe(true);
    expect(result.current).toBe(50);
  });

  it("reports allowed=false when at the member limit", async () => {
    prisma.business.findUnique.mockResolvedValue({ planId: "FREE" });
    // FREE plan member limit is 500
    prisma.membership.count.mockResolvedValue(500);
    const result = await checkPlanLimit("biz1", "members");
    expect(result.allowed).toBe(false);
  });

  it("allows unlimited when limit is null (SCALE plan)", async () => {
    prisma.business.findUnique.mockResolvedValue({ planId: "SCALE" });
    prisma.membership.count.mockResolvedValue(99999);
    const result = await checkPlanLimit("biz1", "members");
    expect(result.limit).toBeNull();
    expect(result.allowed).toBe(true);
  });
});

describe("handleYocoWebhook — payment.succeeded idempotency", () => {
  const successPayload = {
    type: "payment.succeeded",
    payload: {
      id: "pay_test_123",
      metadata: { businessId: "biz1", planId: "PROFESSIONAL" }
    }
  };

  it("creates subscription and invoice on first call", async () => {
    await handleYocoWebhook(successPayload);
    expect(mockTx.businessSubscription.create).toHaveBeenCalledOnce();
    expect(mockTx.businessInvoice.create).toHaveBeenCalledOnce();
  });

  it("skips duplicate processing when invoice already exists", async () => {
    mockTx.businessInvoice.findFirst.mockResolvedValue({ id: "inv_existing" });
    await handleYocoWebhook(successPayload);
    expect(mockTx.businessSubscription.create).not.toHaveBeenCalled();
    expect(mockTx.businessInvoice.create).not.toHaveBeenCalled();
  });

  it("logs a warning and returns early when metadata is missing", async () => {
    await expect(
      handleYocoWebhook({ type: "payment.succeeded", payload: {} })
    ).resolves.toBeUndefined();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
