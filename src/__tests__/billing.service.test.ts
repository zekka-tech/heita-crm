import { beforeEach, describe, expect, it, vi } from "vitest";

// Single unified mock — withBusinessScope passes this object as `tx`,
// so all transactional and direct Prisma calls go through the same mock.
const prisma = {
  $transaction: vi.fn((fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma)),
  business: { findUnique: vi.fn(), update: vi.fn() },
  businessSubscription: { findFirst: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
  staffMember: { count: vi.fn(), findFirst: vi.fn() },
  businessInvoice: { findFirst: vi.fn(), create: vi.fn() },
  membership: { count: vi.fn() },
  aiTokenUsage: { count: vi.fn() },
  businessDocument: { count: vi.fn() }
};

vi.mock("@/lib/prisma", () => ({
  prisma,
  withBusinessScope: vi.fn(async (_businessId: string, fn: (tx: typeof prisma) => unknown) => fn(prisma))
}));
vi.mock("@/server/services/staff-audit.service", () => ({
  recordStaffAuditLog: vi.fn().mockResolvedValue(undefined)
}));
vi.mock("@/lib/telemetry", () => ({
  captureEvent: vi.fn()
}));

const {
  applyPaymentEvent,
  checkPlanLimit,
  getEffectivePlan,
  handleYocoWebhook,
  isPaidBusinessPlan,
  requirePaidBusinessPlan
} = await import("@/server/services/billing.service");
const { captureEvent } = await import("@/lib/telemetry");
const { TELEMETRY_EVENTS } = await import("@/lib/telemetry-events");

beforeEach(() => {
  vi.clearAllMocks();
  // Default: no blocking subscription, so a paid planId stays paid unless a
  // test explicitly sets a PAST_DUE/CANCELLED subscription.
  prisma.businessSubscription.findFirst.mockResolvedValue(null);
  prisma.staffMember.findFirst.mockResolvedValue({ userId: "owner_1" });
  prisma.businessInvoice.findFirst.mockResolvedValue(null);
  prisma.businessInvoice.create.mockResolvedValue({});
  prisma.businessSubscription.create.mockResolvedValue({});
  prisma.businessSubscription.updateMany.mockResolvedValue({ count: 0 });
  prisma.business.update.mockResolvedValue({});
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
  it("identifies Starter, Growth and Scale as paid plans", () => {
    expect(isPaidBusinessPlan("FREE")).toBe(false);
    expect(isPaidBusinessPlan("STARTER")).toBe(true);
    expect(isPaidBusinessPlan("GROWTH")).toBe(true);
    expect(isPaidBusinessPlan("SCALE")).toBe(true);
  });

  it("rejects paid-only features on Free", async () => {
    prisma.business.findUnique.mockResolvedValue({ planId: "FREE" });
    await expect(requirePaidBusinessPlan("biz1", "Sales pipeline")).rejects.toThrow(/paid plans only/);
  });

  it("allows paid-only features on Starter", async () => {
    prisma.business.findUnique.mockResolvedValue({ planId: "STARTER" });
    await expect(requirePaidBusinessPlan("biz1", "Sales pipeline")).resolves.toBe("STARTER");
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
    expect(prisma.businessSubscription.create).toHaveBeenCalledOnce();
    expect(prisma.businessInvoice.create).toHaveBeenCalledOnce();
  });
  it("captures subscription_started when a business moves from FREE to a paid plan", async () => {
    prisma.business.findUnique.mockResolvedValue({ planId: "FREE" });

    await handleYocoWebhook(successPayload);

    expect(captureEvent).toHaveBeenCalledWith({
      userId: "owner_1",
      event: TELEMETRY_EVENTS.subscriptionStarted,
      properties: {
        businessId: "biz1",
        plan: "GROWTH",
        billingInterval: "monthly"
      }
    });
  });

  it("captures subscription_upgraded when a business changes paid plans", async () => {
    prisma.business.findUnique.mockResolvedValue({ planId: "STARTER" });

    await handleYocoWebhook(successPayload);

    expect(captureEvent).toHaveBeenCalledWith({
      userId: "owner_1",
      event: TELEMETRY_EVENTS.subscriptionUpgraded,
      properties: {
        businessId: "biz1",
        previousPlan: "STARTER",
        newPlan: "GROWTH",
        billingInterval: "monthly"
      }
    });
  });

  it("does not emit subscription funnel telemetry for same-plan renewals", async () => {
    prisma.business.findUnique.mockResolvedValue({ planId: "GROWTH" });

    await handleYocoWebhook(successPayload);

    expect(captureEvent).not.toHaveBeenCalled();
  });

  it("skips duplicate processing when invoice already exists", async () => {
    prisma.businessInvoice.findFirst.mockResolvedValue({ id: "inv_existing" });
    await handleYocoWebhook(successPayload);
    expect(prisma.businessSubscription.create).not.toHaveBeenCalled();
    expect(prisma.businessInvoice.create).not.toHaveBeenCalled();
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
    expect(prisma.businessInvoice.create).not.toHaveBeenCalled();
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

    expect(prisma.businessSubscription.updateMany).toHaveBeenCalledWith(
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
    expect(prisma.business.update).not.toHaveBeenCalled();
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
    prisma.businessSubscription.updateMany.mockResolvedValue({ count: 0 });
    await applyPaymentEvent({
      provider: "STRIPE",
      type: "subscription_cancelled",
      businessId: "biz1",
      planId: "GROWTH",
      providerSubscriptionId: "sub_stale"
    });
    expect(prisma.businessSubscription.updateMany).toHaveBeenCalled();
    expect(prisma.business.update).not.toHaveBeenCalled();
  });

  it("downgrades the business to FREE when a subscription is cancelled", async () => {
    prisma.businessSubscription.updateMany.mockResolvedValue({ count: 1 });
    await applyPaymentEvent({
      provider: "STRIPE",
      type: "subscription_cancelled",
      businessId: "biz1",
      planId: "GROWTH",
      providerSubscriptionId: "sub_live"
    });
    expect(prisma.business.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "biz1" },
        data: { planId: "FREE" }
      })
    );
  });
});
