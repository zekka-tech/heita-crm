import { describe, expect, it, vi } from "vitest";

const mockMembership = {
  id: "mem_1",
  businessId: "biz_1",
  isActive: true,
  pointsBalance: 100,
  business: { deletedAt: null, isActive: true },
  transactions: [
    {
      id: "tx_earn",
      pointsDelta: 100,
      expiresAt: new Date("2020-01-01"),
      expiryTarget: null,
      refundTarget: null
    }
  ]
};

const mockExpireTx = vi.fn().mockResolvedValue({
  transactionsCreated: 1,
  pointsExpired: 100
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    membership: {
      findMany: vi
        .fn()
        .mockResolvedValueOnce([mockMembership])
        .mockResolvedValue([])
    },
    $transaction: mockExpireTx
  }
}));

const { expireEligiblePoints } = await import("@/server/services/loyalty.service");

describe("expireEligiblePoints", () => {
  it("processes memberships with past-expiry transactions", async () => {
    const result = await expireEligiblePoints(new Date("2026-01-01"));
    expect(result.membershipsProcessed).toBe(1);
    expect(result.transactionsCreated).toBe(1);
    expect(result.pointsExpired).toBe(100);
  });

  it("never produces a negative pointsExpired sum", async () => {
    mockExpireTx.mockResolvedValueOnce({ transactionsCreated: 0, pointsExpired: 0 });
    const result = await expireEligiblePoints(new Date("2030-01-01"));
    expect(result.pointsExpired).toBeGreaterThanOrEqual(0);
  });

  it("returns zero when no eligible memberships exist", async () => {
    vi.mocked((await import("@/lib/prisma")).prisma.membership.findMany).mockResolvedValue([]);
    const result = await expireEligiblePoints(new Date("2030-01-01"));
    expect(result.membershipsProcessed).toBe(0);
    expect(result.pointsExpired).toBe(0);
  });
});
