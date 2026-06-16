import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  tx: {
    adSpend: {
      upsert: vi.fn(),
      findMany: vi.fn()
    }
  },
  withSystemScope: vi.fn()
}));

vi.mock("@/lib/prisma", () => ({ withSystemScope: mocks.withSystemScope }));

const { recordAdSpend, listAdSpend, AdSpendValidationError } = await import(
  "@/server/services/ad-spend.service"
);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.withSystemScope.mockImplementation(async (fn: (tx: typeof mocks.tx) => Promise<unknown>) =>
    fn(mocks.tx)
  );
  mocks.tx.adSpend.upsert.mockResolvedValue({ id: "spend_1" });
  mocks.tx.adSpend.findMany.mockResolvedValue([]);
});

describe("recordAdSpend", () => {
  const validInput = {
    channel: "Google",
    periodStart: new Date("2026-05-01"),
    periodEnd: new Date("2026-05-31"),
    amountZar: 5000
  };

  it("lowercases the channel and upserts on (channel, period)", async () => {
    await recordAdSpend(validInput);
    expect(mocks.tx.adSpend.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          channel_periodStart_periodEnd: {
            channel: "google",
            periodStart: validInput.periodStart,
            periodEnd: validInput.periodEnd
          }
        },
        create: expect.objectContaining({ channel: "google", amountZar: 5000, note: null })
      })
    );
  });

  it("rejects a blank channel", async () => {
    await expect(recordAdSpend({ ...validInput, channel: "   " })).rejects.toBeInstanceOf(
      AdSpendValidationError
    );
    expect(mocks.tx.adSpend.upsert).not.toHaveBeenCalled();
  });

  it("rejects a negative or non-integer amount", async () => {
    await expect(recordAdSpend({ ...validInput, amountZar: -1 })).rejects.toBeInstanceOf(
      AdSpendValidationError
    );
    await expect(recordAdSpend({ ...validInput, amountZar: 12.5 })).rejects.toBeInstanceOf(
      AdSpendValidationError
    );
  });

  it("rejects a period whose end precedes its start", async () => {
    await expect(
      recordAdSpend({ ...validInput, periodStart: new Date("2026-05-31"), periodEnd: new Date("2026-05-01") })
    ).rejects.toBeInstanceOf(AdSpendValidationError);
  });
});

describe("listAdSpend", () => {
  it("caps the limit at 200 and orders by period desc", async () => {
    await listAdSpend(9999);
    expect(mocks.tx.adSpend.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 200, orderBy: [{ periodStart: "desc" }, { channel: "asc" }] })
    );
  });
});
