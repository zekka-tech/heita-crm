import { beforeEach, describe, expect, it, vi } from "vitest";

const mockTx = {
  businessInvoice: { findFirst: vi.fn(), create: vi.fn() },
  businessSubscription: { create: vi.fn(), updateMany: vi.fn() },
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
  applyPaymentEvent,
  checkPlanLimit,
  getEffectivePlan,
  handleYocoWebhook,
  isPaidBusinessPlan,
  requirePaidBusinessPlan
} = await import("@/server/services/billing.service");

beforeEach(() => {
  vi.clearAllMocks();
  // Default: no blocking subscription, so a paid planId stays paid unless a
  // test explicitly sets a PAST_DUE/CANCELLED subscription.
  prisma.businessSubscription.findFirst.mockResolvedValue(null);
  mockTx.businessInvoice.findFirst.mockResolvedValue(null);
  mockTx.businessInvoice.create.mockResolvedValue({});
  mockTx.businessSubscription.create.mockResolvedValue({});
  mockTx.businessSubscription.updateMany.mockResolvedValue({ count: 0 });
  mockTx.business.update.mockResolvedValue({});
});

describe("getEffectivePlan", () => {
  it("returns business planId when found", async () => {
    prisma.business.findUnique.mockResolvedValue({ planId: "GROWTH" });
    await expect(getEffectivePlan("biz1")).resolves.toBe("GROWTH");
  });

  it("falls back to FREE when business not found", async () => {
    prisma.business.findUnique.mockResolvedValue(null);
    await expect(getEffectivePlan("unknown")).resolves.toBe("FREE");
  });

  it("keeps a paid plan when there is no subscription row (admin/seed grant)", async () => {
    prisma.business.findUnique.mockResolvedValue({ planId: "GROWTH" });
    prisma.businessSubscription.findFirst.mockResolvedValue(null);
    await expect(getEffectivePlan("biz1")).resolves.toBe("GROWTH");
  });

  it("keeps a paid plan when the latest subscription is ACTIVE", async () => {
    prisma.business.findUnique.mockResolvedValue({ planId: "SCALE" });
    prisma.businessSubscription.findFirst.mockResolvedValue({ status: "ACTIVE" });
    await expect(getEffectivePlan("biz1")).resolves.toBe("SCALE");
  });

  it("keeps a paid plan during the past-due grace window", async () => {
    prisma.business.findUnique.mockResolvedValue({ planId: "GROWTH" });
    prisma.businessSubscription.findFirst.mockResolvedValue({ status: "PAST_DUE", updatedAt: new Date() });
    await expect(getEffectivePlan("biz1")).resolves.toBe("GROWTH");
  });

  it("downgrades to FREE when the latest PAST_DUE subscription is outside grace", async () => {
    prisma.business.findUnique.mockResolvedValue({ planId: "GROWTH" });
    prisma.businessSubscription.findFirst.mockResolvedValue({
      status: "PAST_DUE",
      updatedAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000)
    });
    await expect(getEffectivePlan("biz1")).resolves.toBe("FREE");
  });

  it("downgrades to FREE when the latest subscription is CANCELLED", async () => {
    prisma.business.findUnique.mockResolvedValue({ planId: "SCALE" });
    prisma.businessSubscription.findFirst.mockResolvedValue({ status: "CANCELLED" });
    await expect(getEffectivePlan("biz1")).resolves.toBe("FREE");
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

  it("rejects paid-only features when a paid plan is past-due beyond grace", async () => {
    prisma.business.findUnique.mockResolvedValue({ planId: "GROWTH" });
    prisma.businessSubscription.findFirst.mockResolvedValue({
      status: "PAST_DUE",
      updatedAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000)
    });
    await expect(requirePaidBusinessPlan("biz1", "Sales pipeline")).rejects.toThrow(/paid plans only/);
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
      metadata: { businessId: "biz1", planId: "GROWTH" }
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

  it("rejects a success event whose amount does not match the plan price", async () => {
    await expect(
      handleYocoWebhook({
        type: "payment.succeeded",
        payload: {
          id: "pay_amount_mismatch",
          amount: 100, // R1.00 in cents — not the GROWTH price
          metadata: { businessId: "biz1", planId: "GROWTH" }
        }
      })
    ).rejects.toThrow(/amount/i);
    expect(mockTx.businessInvoice.create).not.toHaveBeenCalled();
  });
});

describe("applyPaymentEvent — payment_failed", () => {
  it("marks the matching active subscription PAST_DUE scoped to provider", async () => {
    await applyPaymentEvent({
      provider: "STRIPE",
      type: "payment_failed",
      businessId: "biz1",
      planId: "GROWTH",
      providerPaymentId: "pi_failed_1",
      providerSubscriptionId: "sub_1"
    });

    expect(mockTx.businessSubscription.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          businessId: "biz1",
          provider: "STRIPE",
          status: "ACTIVE",
          providerSubscriptionId: "sub_1"
        }),
        data: { status: "PAST_DUE" }
      })
    );
    // A failed payment must never touch the business plan directly.
    expect(mockTx.business.update).not.toHaveBeenCalled();
  });
});

describe("applyPaymentEvent — subscription_cancelled", () => {
  it("ignores cancellations with no provider subscription id", async () => {
    await applyPaymentEvent({
      provider: "STRIPE",
      type: "subscription_cancelled",
      businessId: "biz1",
      planId: "GROWTH"
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("does not downgrade the business when no subscription row matches (stale event)", async () => {
    mockTx.businessSubscription.updateMany.mockResolvedValue({ count: 0 });
    await applyPaymentEvent({
      provider: "STRIPE",
      type: "subscription_cancelled",
      businessId: "biz1",
      planId: "GROWTH",
      providerSubscriptionId: "sub_stale"
    });
    expect(mockTx.businessSubscription.updateMany).toHaveBeenCalled();
    expect(mockTx.business.update).not.toHaveBeenCalled();
  });

  it("downgrades the business to FREE when a subscription is cancelled", async () => {
    mockTx.businessSubscription.updateMany.mockResolvedValue({ count: 1 });
    await applyPaymentEvent({
      provider: "STRIPE",
      type: "subscription_cancelled",
      businessId: "biz1",
      planId: "GROWTH",
      providerSubscriptionId: "sub_live"
    });
    expect(mockTx.business.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "biz1" },
        data: { planId: "FREE" }
      })
    );
  });
});
