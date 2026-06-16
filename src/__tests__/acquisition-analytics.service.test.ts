import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  tx: { $queryRaw: vi.fn() },
  withSystemScope: vi.fn()
}));

vi.mock("@/lib/prisma", () => ({ withSystemScope: mocks.withSystemScope }));

const { getChannelCacLtv } = await import("@/server/services/acquisition-analytics.service");

beforeEach(() => {
  vi.clearAllMocks();
  mocks.withSystemScope.mockImplementation(async (fn: (tx: typeof mocks.tx) => Promise<unknown>) =>
    fn(mocks.tx)
  );
});

describe("getChannelCacLtv", () => {
  it("computes per-channel CAC, LTV and ratio, and blended totals", async () => {
    // Promise.all order: channelRows, spendRows, cohortRows
    mocks.tx.$queryRaw
      .mockResolvedValueOnce([
        { channel: "google", businesses: 10n, paying_businesses: 4n, revenue_zar: 20000n },
        { channel: "direct", businesses: 5n, paying_businesses: 1n, revenue_zar: 3000n }
      ])
      .mockResolvedValueOnce([{ channel: "google", spend_zar: 5000n }])
      .mockResolvedValueOnce([
        { cohort_month: "2026-05", channel: "google", businesses: 10n, revenue_zar: 20000n }
      ]);

    const report = await getChannelCacLtv(12);

    const google = report.channels.find((c) => c.channel === "google")!;
    expect(google.businesses).toBe(10);
    expect(google.spendZar).toBe(5000);
    expect(google.cacZar).toBe(500); // 5000 / 10
    expect(google.ltvZar).toBe(2000); // 20000 / 10
    expect(google.ltvCacRatio).toBe(4); // 2000 / 500

    const direct = report.channels.find((c) => c.channel === "direct")!;
    expect(direct.spendZar).toBe(0);
    expect(direct.cacZar).toBeNull(); // no spend → CAC undefined
    expect(direct.ltvCacRatio).toBeNull();

    expect(report.totals.businesses).toBe(15);
    expect(report.totals.spendZar).toBe(5000);
    expect(report.totals.revenueZar).toBe(23000);
    expect(report.totals.blendedCacZar).toBeCloseTo(5000 / 15);
    expect(report.cohorts).toHaveLength(1);
    expect(report.cohorts[0]).toMatchObject({ cohortMonth: "2026-05", channel: "google", businesses: 10 });
  });

  it("returns zeroed totals when no businesses were acquired", async () => {
    mocks.tx.$queryRaw
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const report = await getChannelCacLtv(6);
    expect(report.channels).toHaveLength(0);
    expect(report.totals.businesses).toBe(0);
    expect(report.totals.blendedCacZar).toBeNull();
    expect(report.totals.blendedLtvZar).toBe(0);
  });
});
