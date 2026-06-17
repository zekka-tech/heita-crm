import { withSystemScope } from "@/lib/prisma";

// Franchise rollups span every child business under a parent — a legitimate
// cross-tenant read (the caller's ownership of the parent is authorized
// upstream). Run under system scope so the related Membership counts/aggregates
// resolve under the non-BYPASSRLS app role instead of returning 0.
export async function getFranchiseChildBusinesses(parentBusinessId: string) {
  return withSystemScope((tx) =>
    tx.business.findMany({
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
    })
  );
}

export async function getFranchiseAggregateStats(parentBusinessId: string) {
  const [memberCount, totalPoints, locationCount] = await withSystemScope((tx) =>
    Promise.all([
      tx.membership.count({
        where: {
          business: { parentBusinessId, deletedAt: null },
          isActive: true
        }
      }),
      tx.membership.aggregate({
        where: {
          business: { parentBusinessId, deletedAt: null },
          isActive: true
        },
        _sum: { pointsBalance: true }
      }),
      tx.business.count({
        where: { parentBusinessId, deletedAt: null }
      })
    ])
  );

  return {
    locationCount,
    totalMembers: memberCount,
    totalPointsLiability: totalPoints._sum.pointsBalance ?? 0
  };
}
