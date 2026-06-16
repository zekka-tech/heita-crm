import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  tx: {
    business: { findUniqueOrThrow: vi.fn() },
    message: { groupBy: vi.fn() }
  },
  withBusinessScope: vi.fn(),
  getPlanQuota: vi.fn()
}));

vi.mock("@/lib/prisma", () => ({ withBusinessScope: mocks.withBusinessScope }));
vi.mock("@/lib/billing", () => ({ getPlanQuota: mocks.getPlanQuota }));

const {
  getMonthlyMessageUsage,
  checkOutboundMessageAllowance,
  assertOutboundMessageQuota,
  quotaGroupForChannel,
  MessageQuotaExceededError
} = await import("@/server/services/message-usage.service");
const { MessageChannel } = await import("@prisma/client");

beforeEach(() => {
  vi.clearAllMocks();
  mocks.withBusinessScope.mockImplementation(
    async (_businessId: string, fn: (tx: typeof mocks.tx) => Promise<unknown>) => fn(mocks.tx)
  );
  mocks.tx.business.findUniqueOrThrow.mockResolvedValue({ planId: "GROWTH" });
  mocks.getPlanQuota.mockReturnValue({ maxWaTemplatesPerMonth: 1000, maxInAppMessagesPerMonth: 500 });
  mocks.tx.message.groupBy.mockResolvedValue([
    { channel: "WHATSAPP", _count: { _all: 200 } },
    { channel: "IN_APP", _count: { _all: 300 } },
    { channel: "PUSH", _count: { _all: 50 } },
    { channel: "SMS", _count: { _all: 999 } }
  ]);
});

describe("quotaGroupForChannel", () => {
  it("maps channels to quota groups", () => {
    expect(quotaGroupForChannel(MessageChannel.WHATSAPP)).toBe("whatsapp");
    expect(quotaGroupForChannel(MessageChannel.IN_APP)).toBe("in_app");
    expect(quotaGroupForChannel(MessageChannel.PUSH)).toBe("in_app");
    expect(quotaGroupForChannel(MessageChannel.SMS)).toBe("unmetered");
    expect(quotaGroupForChannel(MessageChannel.EMAIL)).toBe("unmetered");
  });
});

describe("getMonthlyMessageUsage", () => {
  it("aggregates outbound counts by quota group with plan limits", async () => {
    const report = await getMonthlyMessageUsage("biz1");

    expect(report.whatsapp).toMatchObject({ used: 200, limit: 1000, remaining: 800, exceeded: false });
    // IN_APP (300) + PUSH (50) collapse into the in_app group.
    expect(report.inApp).toMatchObject({ used: 350, limit: 500, remaining: 150, exceeded: false });

    expect(mocks.tx.message.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        by: ["channel"],
        where: expect.objectContaining({ businessId: "biz1", direction: "OUTBOUND" })
      })
    );
  });

  it("marks a group exceeded when usage reaches the limit", async () => {
    mocks.tx.message.groupBy.mockResolvedValue([{ channel: "WHATSAPP", _count: { _all: 1000 } }]);
    const report = await getMonthlyMessageUsage("biz1");
    expect(report.whatsapp).toMatchObject({ used: 1000, remaining: 0, exceeded: true });
  });

  it("treats a null plan limit as unlimited", async () => {
    mocks.getPlanQuota.mockReturnValue({ maxWaTemplatesPerMonth: null, maxInAppMessagesPerMonth: null });
    const report = await getMonthlyMessageUsage("biz1");
    expect(report.whatsapp.limit).toBeNull();
    expect(report.whatsapp.remaining).toBeNull();
    expect(report.whatsapp.exceeded).toBe(false);
  });
});

describe("checkOutboundMessageAllowance", () => {
  it("returns an unmetered allowance for SMS/email without querying usage", async () => {
    const usage = await checkOutboundMessageAllowance("biz1", MessageChannel.SMS);
    expect(usage).toMatchObject({ group: "unmetered", limit: null, exceeded: false });
    expect(mocks.tx.message.groupBy).not.toHaveBeenCalled();
  });
});

describe("assertOutboundMessageQuota", () => {
  it("passes when sending stays within the limit", async () => {
    await expect(
      assertOutboundMessageQuota({ businessId: "biz1", channel: MessageChannel.WHATSAPP, count: 10 })
    ).resolves.toBeUndefined();
  });

  it("throws MessageQuotaExceededError when the send would exceed the limit", async () => {
    mocks.tx.message.groupBy.mockResolvedValue([{ channel: "WHATSAPP", _count: { _all: 995 } }]);
    await expect(
      assertOutboundMessageQuota({ businessId: "biz1", channel: MessageChannel.WHATSAPP, count: 10 })
    ).rejects.toBeInstanceOf(MessageQuotaExceededError);
  });

  it("never blocks unmetered channels", async () => {
    await expect(
      assertOutboundMessageQuota({ businessId: "biz1", channel: MessageChannel.SMS, count: 100000 })
    ).resolves.toBeUndefined();
  });
});
