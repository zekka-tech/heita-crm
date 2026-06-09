import { prisma } from "@/lib/prisma";

export async function getFranchiseChildBusinesses(parentBusinessId: string) {
  return prisma.business.findMany({
    where: { parentBusinessId, deletedAt: null },
    select: {
      id: true,
      name: true,
      slug: true,
      province: true,
      _count: {
        select: { memberships: true }
      }
    },
    orderBy: { name: "asc" }
  });
}

export async function getFranchiseAggregateStats(parentBusinessId: string) {
  const [memberCount, totalPoints, locationCount] = await Promise.all([
    prisma.membership.count({
      where: {
        business: { parentBusinessId, deletedAt: null },
        isActive: true
      }
    }),
    prisma.membership.aggregate({
      where: {
        business: { parentBusinessId, deletedAt: null },
        isActive: true
      },
      _sum: { pointsBalance: true }
    }),
    prisma.business.count({
      where: { parentBusinessId, deletedAt: null }
    })
  ]);

  return {
    locationCount,
    totalMembers: memberCount,
    totalPointsLiability: totalPoints._sum.pointsBalance ?? 0
  };
}
