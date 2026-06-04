import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    business: {
      findMany: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
    },
    membership: {
      count: vi.fn(),
      aggregate: vi.fn(),
    },
  },
}));

import { getFranchiseAggregateStats, getFranchiseChildBusinesses, linkChildBusiness } from "@/server/services/franchise.service";
import { prisma } from "@/lib/prisma";

describe("getFranchiseAggregateStats", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns aggregate stats for a franchise", async () => {
    (prisma.membership.count as ReturnType<typeof vi.fn>).mockResolvedValueOnce(150);
    (prisma.membership.aggregate as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      _sum: { pointsBalance: 25000 },
    });
    (prisma.business.count as ReturnType<typeof vi.fn>).mockResolvedValueOnce(5);

    const stats = await getFranchiseAggregateStats("parent1");
    expect(stats.locationCount).toBe(5);
    expect(stats.totalMembers).toBe(150);
    expect(stats.totalPointsLiability).toBe(25000);
  });

  it("handles null pointsBalance aggregate", async () => {
    (prisma.membership.count as ReturnType<typeof vi.fn>).mockResolvedValueOnce(0);
    (prisma.membership.aggregate as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      _sum: { pointsBalance: null },
    });
    (prisma.business.count as ReturnType<typeof vi.fn>).mockResolvedValueOnce(0);

    const stats = await getFranchiseAggregateStats("parent1");
    expect(stats.totalPointsLiability).toBe(0);
  });

  it("returns zero counts for a franchise with no children", async () => {
    (prisma.membership.count as ReturnType<typeof vi.fn>).mockResolvedValueOnce(0);
    (prisma.membership.aggregate as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      _sum: { pointsBalance: 0 },
    });
    (prisma.business.count as ReturnType<typeof vi.fn>).mockResolvedValueOnce(0);

    const stats = await getFranchiseAggregateStats("empty_parent");
    expect(stats).toEqual({
      locationCount: 0,
      totalMembers: 0,
      totalPointsLiability: 0,
    });
  });
});

describe("getFranchiseChildBusinesses", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns child businesses with member counts", async () => {
    (prisma.business.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { id: "c1", name: "Shop A", slug: "shop-a", province: "GAUTENG", _count: { memberships: 30 } },
      { id: "c2", name: "Shop B", slug: "shop-b", province: "KWAZULU_NATAL", _count: { memberships: 20 } },
    ]);

    const children = await getFranchiseChildBusinesses("parent1");
    expect(children).toHaveLength(2);
    expect(children[0]!.name).toBe("Shop A");
    expect(children[1]!.name).toBe("Shop B");
  });

  it("returns an empty array when no children exist", async () => {
    (prisma.business.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

    const children = await getFranchiseChildBusinesses("parent1");
    expect(children).toEqual([]);
  });
});

describe("linkChildBusiness", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sets parentBusinessId on child", async () => {
    (prisma.business.update as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: "c1",
      name: "Shop A",
    });

    const result = await linkChildBusiness("parent1", "child1");
    expect(result).toBeDefined();
    expect(prisma.business.update).toHaveBeenCalledWith({
      where: { id: "child1" },
      data: { parentBusinessId: "parent1" },
    });
  });
});
