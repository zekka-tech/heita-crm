import { Prisma } from "@prisma/client";

import { withAnalyticsCache } from "@/lib/data-cache";
import { withBusinessScope } from "@/lib/prisma";

type WeeklyBucket = {
  label: string;
  memberJoins: number;
  pointsIssued: number;
  pointsRedeemed: number;
  messagesInbound: number;
  messagesOutbound: number;
};

// Raw SQL rows returned by Postgres aggregations. COUNT/SUM return bigint in
// the node-postgres driver, so we coerce to Number at the boundary.
type JoinRow = { week: Date; joins: bigint };
type TxRow = { week: Date; issued: bigint; redeemed: bigint };
type MsgRow = { week: Date; inbound: bigint; outbound: bigint };
type TxKpi = { issued: bigint | null; redeemed: bigint | null };
type MsgKpi = { inbound: bigint | null; outbound: bigint | null };
type MemberStatsRow = {
  totalMembers: bigint;
  activeMembersLast90d: bigint;
  pointsLiability: bigint;
};
type TopRewardRow = {
  rewardId: string;
  title: string | null;
  redemptions: bigint;
};

export type TopReward = {
  rewardId: string;
  title: string;
  redemptions: number;
};

function startOfWeek(input: Date): Date {
  const date = new Date(input);
  const day = date.getDay();
  const diff = (day + 6) % 7; // Monday = 0 offset
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - diff);
  return date;
}

// Postgres date_trunc('week', ...) returns Monday 00:00:00 UTC — same as our
// startOfWeek for servers running in UTC. Slice to YYYY-MM-DD for map keying.
function weekKey(date: Date): string {
  return new Date(date).toISOString().slice(0, 10);
}

function bucketLabel(key: string): string {
  const date = new Date(`${key}T00:00:00.000Z`);
  return date.toLocaleDateString("en-ZA", { month: "short", day: "numeric" });
}

async function _getBusinessDashboardAnalytics(input: {
  businessId: string;
  weeks: number;
}) {
  const { businessId, weeks } = input;
  const from = startOfWeek(new Date(Date.now() - (weeks - 1) * 7 * 24 * 60 * 60 * 1000));
  const last30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  // Eight parallel queries — all constant-memory DB aggregations.
  // Each query does constant-memory aggregation in Postgres using existing indexes
  // on (businessId, joinedAt) / (businessId, createdAt) / (businessId, direction, createdAt).
  const last90 = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

  const [joinRows, txRows, msgRows, txKpi, msgKpi, memberStats, topRewards] = await withBusinessScope(
    businessId,
    (tx) => Promise.all([
      tx.$queryRaw<JoinRow[]>(Prisma.sql`
      SELECT
        date_trunc('week', "joinedAt") AS week,
        COUNT(*) AS joins
      FROM "Membership"
      WHERE "businessId" = ${businessId}
        AND "joinedAt" >= ${from}
      GROUP BY 1
    `),

      tx.$queryRaw<TxRow[]>(Prisma.sql`
      SELECT
        date_trunc('week', "createdAt") AS week,
        SUM(
          CASE WHEN type IN ('EARN','SIGNUP_BONUS','ADJUSTMENT','REFUND')
                AND "pointsDelta" > 0
               THEN "pointsDelta" ELSE 0 END
        ) AS issued,
        SUM(
          CASE WHEN type IN ('REDEEM','EXPIRY')
               THEN ABS("pointsDelta") ELSE 0 END
        ) AS redeemed
      FROM "LoyaltyTransaction"
      WHERE "businessId" = ${businessId}
        AND "createdAt" >= ${from}
      GROUP BY 1
    `),

      tx.$queryRaw<MsgRow[]>(Prisma.sql`
      SELECT
        date_trunc('week', "createdAt") AS week,
        COUNT(*) FILTER (WHERE direction = 'INBOUND')  AS inbound,
        COUNT(*) FILTER (WHERE direction = 'OUTBOUND') AS outbound
      FROM "Message"
      WHERE "businessId" = ${businessId}
        AND "createdAt" >= ${from}
      GROUP BY 1
    `),

      tx.$queryRaw<TxKpi[]>(Prisma.sql`
      SELECT
        SUM(
          CASE WHEN type IN ('EARN','SIGNUP_BONUS','ADJUSTMENT','REFUND')
                AND "pointsDelta" > 0
               THEN "pointsDelta" ELSE 0 END
        ) AS issued,
        SUM(
          CASE WHEN type IN ('REDEEM','EXPIRY')
               THEN ABS("pointsDelta") ELSE 0 END
        ) AS redeemed
      FROM "LoyaltyTransaction"
      WHERE "businessId" = ${businessId}
        AND "createdAt" >= ${last30}
    `),

      tx.$queryRaw<MsgKpi[]>(Prisma.sql`
      SELECT
        COUNT(*) FILTER (WHERE direction = 'INBOUND')  AS inbound,
        COUNT(*) FILTER (WHERE direction = 'OUTBOUND') AS outbound
      FROM "Message"
      WHERE "businessId" = ${businessId}
        AND "createdAt" >= ${last30}
    `),

    // Member stats: total count, active in last 90d (any transaction), points liability.
      tx.$queryRaw<MemberStatsRow[]>(Prisma.sql`
      SELECT
        COUNT(*) AS "totalMembers",
        COUNT(*) FILTER (WHERE id IN (
          SELECT DISTINCT "membershipId"
          FROM "LoyaltyTransaction"
          WHERE "businessId" = ${businessId}
            AND "createdAt" >= ${last90}
        )) AS "activeMembersLast90d",
        COALESCE(SUM("pointsBalance"), 0) AS "pointsLiability"
      FROM "Membership"
      WHERE "businessId" = ${businessId}
    `),

    // Top 5 rewards by redemption count, derived from transaction metadata JSON.
      tx.$queryRaw<TopRewardRow[]>(Prisma.sql`
      SELECT
        lt.metadata->>'rewardId' AS "rewardId",
        MIN(r.title)             AS title,
        COUNT(*)                 AS redemptions
      FROM "LoyaltyTransaction" lt
      LEFT JOIN "Reward" r ON r.id = lt.metadata->>'rewardId'
      WHERE lt."businessId" = ${businessId}
        AND lt.type = 'REDEEM'
        AND lt.metadata->>'rewardId' IS NOT NULL
      GROUP BY 1
      ORDER BY redemptions DESC
      LIMIT 5
      `),
    ])
  );

  // Build the ordered bucket map (one entry per week, including empty weeks).
  const bucketMap = new Map<string, WeeklyBucket>();
  for (let i = 0; i < weeks; i++) {
    const weekDate = new Date(from);
    weekDate.setDate(from.getDate() + i * 7);
    const key = weekKey(startOfWeek(weekDate));
    bucketMap.set(key, {
      label: bucketLabel(key),
      memberJoins: 0,
      pointsIssued: 0,
      pointsRedeemed: 0,
      messagesInbound: 0,
      messagesOutbound: 0,
    });
  }

  // Merge SQL rows into the bucket map — only weeks present in the map are used.
  for (const row of joinRows) {
    const bucket = bucketMap.get(weekKey(row.week));
    if (bucket) bucket.memberJoins = Number(row.joins);
  }
  for (const row of txRows) {
    const bucket = bucketMap.get(weekKey(row.week));
    if (bucket) {
      bucket.pointsIssued = Number(row.issued);
      bucket.pointsRedeemed = Number(row.redeemed);
    }
  }
  for (const row of msgRows) {
    const bucket = bucketMap.get(weekKey(row.week));
    if (bucket) {
      bucket.messagesInbound = Number(row.inbound);
      bucket.messagesOutbound = Number(row.outbound);
    }
  }

  const kpiTx = txKpi[0];
  const kpiMsg = msgKpi[0];
  const stats = memberStats[0];
  const pointsIssued30d = Number(kpiTx?.issued ?? 0);
  const pointsRedeemed30d = Number(kpiTx?.redeemed ?? 0);
  const totalMembersCount = Number(stats?.totalMembers ?? 0);
  const activeLast90d = Number(stats?.activeMembersLast90d ?? 0);

  return {
    series: [...bucketMap.values()],
    kpis: {
      pointsIssued30d,
      pointsRedeemed30d,
      redemptionRate30d:
        pointsIssued30d > 0 ? pointsRedeemed30d / pointsIssued30d : 0,
      inbound30d: Number(kpiMsg?.inbound ?? 0),
      outbound30d: Number(kpiMsg?.outbound ?? 0),
      totalMembers: totalMembersCount,
      activeMembersLast90d: activeLast90d,
      activeMemberRate90d:
        totalMembersCount > 0 ? activeLast90d / totalMembersCount : 0,
      pointsLiability: Number(stats?.pointsLiability ?? 0),
    },
    topRewards: topRewards.map((r) => ({
      rewardId: r.rewardId,
      title: r.title ?? "(deleted reward)",
      redemptions: Number(r.redemptions),
    })) satisfies TopReward[],
  };
}

export function getBusinessDashboardAnalytics(input: {
  businessId: string;
  weeks?: number;
}) {
  const weeks = input.weeks ?? 8;
  return withAnalyticsCache(input.businessId, weeks, () =>
    _getBusinessDashboardAnalytics({ businessId: input.businessId, weeks })
  );
}
