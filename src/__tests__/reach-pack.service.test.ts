import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  tx: {
    merchantCreditLedger: { aggregate: vi.fn(), create: vi.fn() },
    messagePack: { create: vi.fn(), groupBy: vi.fn(), findMany: vi.fn(), findFirst: vi.fn() }
  },
  withBusinessScope: vi.fn()
}));

vi.mock("@/lib/prisma", () => ({ withBusinessScope: mocks.withBusinessScope }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const {
  purchaseReachPackWithCredit,
  getActivePackUnits,
  sumActivePackUnits,
  packGroupToQuotaGroup,
  grantReachPackFromPayment,
  ReachPackError
} = await import("@/server/services/reach-pack.service");

beforeEach(() => {
  vi.clearAllMocks();
  mocks.withBusinessScope.mockImplementation(
    async (_businessId: string, fn: (tx: typeof mocks.tx) => Promise<unknown>) => fn(mocks.tx)
  );
  mocks.tx.merchantCreditLedger.aggregate.mockResolvedValue({ _sum: { amountZar: 1000 } });
  mocks.tx.merchantCreditLedger.create.mockResolvedValue({});
  mocks.tx.messagePack.create.mockResolvedValue({ id: "pack1" });
  mocks.tx.messagePack.groupBy.mockResolvedValue([]);
  mocks.tx.messagePack.findFirst.mockResolvedValue(null);
});

describe("packGroupToQuotaGroup", () => {
  it("maps pack groups to quota groups", () => {
    expect(packGroupToQuotaGroup("WHATSAPP")).toBe("whatsapp");
    expect(packGroupToQuotaGroup("IN_APP")).toBe("in_app");
  });
});

describe("purchaseReachPackWithCredit", () => {
  it("debits credit and grants the pack when credit is sufficient", async () => {
    const result = await purchaseReachPackWithCredit({ businessId: "biz1", packId: "wa_500" });

    expect(result).toMatchObject({ priceZar: 149, remainingCreditZar: 851 });
    expect(mocks.tx.merchantCreditLedger.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ amountZar: -149, type: "REACH_PACK" }) })
    );
    expect(mocks.tx.messagePack.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ group: "WHATSAPP", units: 500, source: "CREDIT" }) })
    );
  });

  it("rejects an unknown pack id before touching credit", async () => {
    await expect(
      purchaseReachPackWithCredit({ businessId: "biz1", packId: "nope" })
    ).rejects.toBeInstanceOf(ReachPackError);
    expect(mocks.withBusinessScope).not.toHaveBeenCalled();
  });

  it("rejects when account credit is insufficient (no debit, no grant)", async () => {
    mocks.tx.merchantCreditLedger.aggregate.mockResolvedValue({ _sum: { amountZar: 50 } });
    await expect(
      purchaseReachPackWithCredit({ businessId: "biz1", packId: "wa_500" })
    ).rejects.toBeInstanceOf(ReachPackError);
    expect(mocks.tx.merchantCreditLedger.create).not.toHaveBeenCalled();
    expect(mocks.tx.messagePack.create).not.toHaveBeenCalled();
  });
});

describe("grantReachPackFromPayment", () => {
  const base = { businessId: "biz1", packId: "wa_500", providerPaymentId: "pay_1", amountZar: 149 };

  it("grants a PURCHASE pack on a valid payment, keyed to the payment id", async () => {
    const pack = await grantReachPackFromPayment(base);
    expect(pack).toEqual({ id: "pack1" });
    expect(mocks.tx.messagePack.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ group: "WHATSAPP", units: 500, source: "PURCHASE", invoiceId: "pay_1" })
      })
    );
  });

  it("is idempotent — a repeat webhook for the same payment id is a no-op", async () => {
    mocks.tx.messagePack.findFirst.mockResolvedValue({ id: "existing" });
    const result = await grantReachPackFromPayment(base);
    expect(result).toBeNull();
    expect(mocks.tx.messagePack.create).not.toHaveBeenCalled();
  });

  it("rejects an amount that does not match the SKU price", async () => {
    const result = await grantReachPackFromPayment({ ...base, amountZar: 1 });
    expect(result).toBeNull();
    expect(mocks.tx.messagePack.create).not.toHaveBeenCalled();
  });

  it("returns null for an unknown SKU", async () => {
    const result = await grantReachPackFromPayment({ ...base, packId: "nope" });
    expect(result).toBeNull();
  });
});

describe("sumActivePackUnits / getActivePackUnits", () => {
  it("sums non-expired units per quota group", async () => {
    mocks.tx.messagePack.groupBy.mockResolvedValue([
      { group: "WHATSAPP", _sum: { units: 500 } },
      { group: "IN_APP", _sum: { units: 2000 } }
    ]);
    await expect(getActivePackUnits("biz1")).resolves.toEqual({ whatsapp: 500, in_app: 2000 });
    expect(mocks.tx.messagePack.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ businessId: "biz1", expiresAt: { gt: expect.any(Date) } }) })
    );
  });

  it("returns zeros when there are no active packs", async () => {
    const totals = await sumActivePackUnits(mocks.tx as never, "biz1");
    expect(totals).toEqual({ whatsapp: 0, in_app: 0 });
  });
});
