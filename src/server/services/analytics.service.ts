import { TransactionType } from "@prisma/client";

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

export async function getBusinessDashboardAnalytics(input: {
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

  const last30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [issued30d, redeemed30d, inbound30d, outbound30d] = await Promise.all([
    prisma.loyaltyTransaction.aggregate({
      where: {
        businessId: input.businessId,
        createdAt: {
          gte: last30
        },
        type: {
          in: [
            TransactionType.EARN,
            TransactionType.SIGNUP_BONUS,
            TransactionType.ADJUSTMENT,
            TransactionType.REFUND
          ]
        },
        pointsDelta: {
          gt: 0
        }
      },
      _sum: {
        pointsDelta: true
      }
    }),
    prisma.loyaltyTransaction.aggregate({
      where: {
        businessId: input.businessId,
        createdAt: {
          gte: last30
        },
        type: {
          in: [TransactionType.REDEEM, TransactionType.EXPIRY]
        }
      },
      _sum: {
        pointsDelta: true
      }
    }),
    prisma.message.count({
      where: {
        businessId: input.businessId,
        createdAt: {
          gte: last30
        },
        direction: "INBOUND"
      }
    }),
    prisma.message.count({
      where: {
        businessId: input.businessId,
        createdAt: {
          gte: last30
        },
        direction: "OUTBOUND"
      }
    })
  ]);

  const pointsIssued30d = issued30d._sum.pointsDelta ?? 0;
  const pointsRedeemed30d = Math.abs(redeemed30d._sum.pointsDelta ?? 0);

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
