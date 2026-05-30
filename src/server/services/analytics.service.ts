import { TransactionType } from "@prisma/client";

import { withAnalyticsCache } from "@/lib/data-cache";
import { prisma } from "@/lib/prisma";

type WeeklyBucket = {
  label: string;
  memberJoins: number;
  pointsIssued: number;
  pointsRedeemed: number;
  messagesInbound: number;
  messagesOutbound: number;
};

function startOfWeek(input: Date) {
  const date = new Date(input);
  const day = date.getDay();
  const diff = (day + 6) % 7;
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - diff);
  return date;
}

function bucketKey(input: Date) {
  return startOfWeek(input).toISOString().slice(0, 10);
}

function bucketLabel(key: string) {
  const date = new Date(`${key}T00:00:00.000Z`);
  return date.toLocaleDateString("en-ZA", {
    month: "short",
    day: "numeric"
  });
}

async function _getBusinessDashboardAnalytics(input: {
  businessId: string;
  weeks?: number;
}) {
  const weeks = input.weeks ?? 8;
  const from = startOfWeek(new Date(Date.now() - (weeks - 1) * 7 * 24 * 60 * 60 * 1000));
  const bucketMap = new Map<string, WeeklyBucket>();

  for (let index = 0; index < weeks; index += 1) {
    const week = new Date(from);
    week.setDate(from.getDate() + index * 7);
    const key = bucketKey(week);
    bucketMap.set(key, {
      label: bucketLabel(key),
      memberJoins: 0,
      pointsIssued: 0,
      pointsRedeemed: 0,
      messagesInbound: 0,
      messagesOutbound: 0
    });
  }

  const [memberships, transactions, messages] = await Promise.all([
    prisma.membership.findMany({
      where: {
        businessId: input.businessId,
        joinedAt: {
          gte: from
        }
      },
      select: {
        joinedAt: true
      }
    }),
    prisma.loyaltyTransaction.findMany({
      where: {
        businessId: input.businessId,
        createdAt: {
          gte: from
        }
      },
      select: {
        createdAt: true,
        pointsDelta: true,
        type: true
      }
    }),
    prisma.message.findMany({
      where: {
        businessId: input.businessId,
        createdAt: {
          gte: from
        }
      },
      select: {
        createdAt: true,
        direction: true
      }
    })
  ]);

  for (const membership of memberships) {
    const bucket = bucketMap.get(bucketKey(membership.joinedAt));
    if (bucket) {
      bucket.memberJoins += 1;
    }
  }

  for (const transaction of transactions) {
    const bucket = bucketMap.get(bucketKey(transaction.createdAt));
    if (!bucket) continue;

    if (
      transaction.type === TransactionType.EARN ||
      transaction.type === TransactionType.SIGNUP_BONUS ||
      transaction.type === TransactionType.ADJUSTMENT ||
      transaction.type === TransactionType.REFUND
    ) {
      bucket.pointsIssued += Math.max(transaction.pointsDelta, 0);
    }

    if (
      transaction.type === TransactionType.REDEEM ||
      transaction.type === TransactionType.EXPIRY
    ) {
      bucket.pointsRedeemed += Math.abs(transaction.pointsDelta);
    }
  }

  for (const message of messages) {
    const bucket = bucketMap.get(bucketKey(message.createdAt));
    if (!bucket) continue;

    if (message.direction === "INBOUND") {
      bucket.messagesInbound += 1;
    } else {
      bucket.messagesOutbound += 1;
    }
  }

  // 30d KPIs are computed from the already-fetched transaction/message arrays
  // (which cover the full `weeks` window, always ≥ 30 days). This avoids 4
  // extra DB round-trips per dashboard load.
  const last30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const EARN_TYPES = new Set<TransactionType>([
    TransactionType.EARN,
    TransactionType.SIGNUP_BONUS,
    TransactionType.ADJUSTMENT,
    TransactionType.REFUND
  ]);
  const REDEEM_TYPES = new Set<TransactionType>([
    TransactionType.REDEEM,
    TransactionType.EXPIRY
  ]);

  let pointsIssued30d = 0;
  let pointsRedeemed30d = 0;
  let inbound30d = 0;
  let outbound30d = 0;

  for (const tx of transactions) {
    if (tx.createdAt < last30) continue;
    if (EARN_TYPES.has(tx.type) && tx.pointsDelta > 0) pointsIssued30d += tx.pointsDelta;
    if (REDEEM_TYPES.has(tx.type)) pointsRedeemed30d += Math.abs(tx.pointsDelta);
  }
  for (const msg of messages) {
    if (msg.createdAt < last30) continue;
    if (msg.direction === "INBOUND") inbound30d += 1;
    else outbound30d += 1;
  }

  return {
    series: [...bucketMap.values()],
    kpis: {
      pointsIssued30d,
      pointsRedeemed30d,
      redemptionRate30d:
        pointsIssued30d > 0 ? pointsRedeemed30d / pointsIssued30d : 0,
      inbound30d,
      outbound30d
    }
  };
}

export function getBusinessDashboardAnalytics(input: {
  businessId: string;
  weeks?: number;
}) {
  // Cache only for the default 8-week window (dashboard view).
  // Custom-week calls (e.g. analytics page with date range) bypass the cache.
  if (!input.weeks || input.weeks === 8) {
    return withAnalyticsCache(input.businessId, () =>
      _getBusinessDashboardAnalytics(input)
    );
  }
  return _getBusinessDashboardAnalytics(input);
}
