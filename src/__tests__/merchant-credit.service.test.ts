import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  tx: {
    merchantCreditLedger: { aggregate: vi.fn(), findMany: vi.fn(), create: vi.fn() }
  },
  withBusinessScope: vi.fn()
}));

vi.mock("@/lib/prisma", () => ({ withBusinessScope: mocks.withBusinessScope }));

const { getMerchantCreditBalance, computeApplicableCredit, consumeMerchantCredit } = await import(
  "@/server/services/merchant-credit.service"
);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.withBusinessScope.mockImplementation(
    async (_businessId: string, fn: (tx: typeof mocks.tx) => Promise<unknown>) => fn(mocks.tx)
  );
});

describe("getMerchantCreditBalance", () => {
  it("returns the ledger sum, defaulting to 0", async () => {
    mocks.tx.merchantCreditLedger.aggregate.mockResolvedValue({ _sum: { amountZar: 750 } });
    await expect(getMerchantCreditBalance("biz1")).resolves.toBe(750);

    mocks.tx.merchantCreditLedger.aggregate.mockResolvedValue({ _sum: { amountZar: null } });
    await expect(getMerchantCreditBalance("biz1")).resolves.toBe(0);
  });
});

describe("computeApplicableCredit", () => {
  it("caps applied credit at plan price minus R1", async () => {
    mocks.tx.merchantCreditLedger.aggregate.mockResolvedValue({ _sum: { amountZar: 5000 } });
    // Plan price R1,499 → max applicable R1,498 even though balance is larger.
    await expect(computeApplicableCredit("biz1", 1499)).resolves.toBe(1498);
  });

  it("uses the full balance when it is below the plan price", async () => {
    mocks.tx.merchantCreditLedger.aggregate.mockResolvedValue({ _sum: { amountZar: 300 } });
    await expect(computeApplicableCredit("biz1", 1499)).resolves.toBe(300);
  });

  it("fails open to 0 when the balance lookup throws (never blocks checkout)", async () => {
    mocks.withBusinessScope.mockRejectedValueOnce(new Error("db down"));
    await expect(computeApplicableCredit("biz1", 1499)).resolves.toBe(0);
  });
});

describe("consumeMerchantCredit", () => {
  it("clamps consumption to the live balance and records a negative entry", async () => {
    mocks.tx.merchantCreditLedger.aggregate.mockResolvedValue({ _sum: { amountZar: 200 } });
    const applied = await consumeMerchantCredit(mocks.tx as never, {
      businessId: "biz1",
      requestedZar: 500,
      invoiceId: "inv1"
    });
    expect(applied).toBe(200);
    expect(mocks.tx.merchantCreditLedger.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ businessId: "biz1", amountZar: -200, type: "INVOICE_APPLIED" })
      })
    );
  });

  it("is a no-op for a non-positive request", async () => {
    const applied = await consumeMerchantCredit(mocks.tx as never, {
      businessId: "biz1",
      requestedZar: 0,
      invoiceId: "inv1"
    });
    expect(applied).toBe(0);
    expect(mocks.tx.merchantCreditLedger.create).not.toHaveBeenCalled();
  });
});
