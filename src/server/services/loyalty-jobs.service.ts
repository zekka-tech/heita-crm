import { TransactionType } from "@prisma/client";

import { logger } from "@/lib/logger";
import { withBusinessScope, withSystemScope } from "@/lib/prisma";
import { sendNotification } from "@/server/services/notification.service";
import {
  createNotificationInTx,
  ensureBusinessOwnership,
  getMembershipForLoyalty,
  recalculateTier,
  type LoyaltyTx
} from "@/server/services/loyalty-internal";

// Batch / cron-driven loyalty maintenance: point expiry, expiry warnings, and
// tier reconciliation. These iterate across tenants under withSystemScope and
// re-enter per-tenant withBusinessScope for the actual writes.

export type ExpirePointsResult = {
  membershipsProcessed: number;
  transactionsCreated: number;
  pointsExpired: number;
};

async function expireMembershipPoints(
  tx: LoyaltyTx,
  input: {
    membershipId: string;
    businessId: string;
    actorUserId?: string | null;
    now: Date;
  }
) {
  const membership = await getMembershipForLoyalty(tx, input.membershipId);
  ensureBusinessOwnership(membership, input.businessId);

  if (membership.pointsBalance <= 0) {
    return {
      transactionsCreated: 0,
      pointsExpired: 0
    };
  }

  const candidates = await tx.loyaltyTransaction.findMany({
    where: {
      membershipId: membership.id,
      businessId: input.businessId,
      expiresAt: {
        lte: input.now
      },
      pointsDelta: {
        gt: 0
      },
      expiryTarget: null,
      refundTarget: null
    },
    orderBy: [{ expiresAt: "asc" }, { createdAt: "asc" }],
    take: 1_000
  });

  let remainingBalance = membership.pointsBalance;
  let pointsExpired = 0;
  let transactionsCreated = 0;

  for (const candidate of candidates) {
    if (remainingBalance <= 0) {
      break;
    }

    const amountToExpire = Math.min(candidate.pointsDelta, remainingBalance);
    if (amountToExpire <= 0) {
      continue;
    }

    await tx.loyaltyTransaction.create({
      data: {
        businessId: membership.businessId,
        membershipId: membership.id,
        userId: input.actorUserId ?? null,
        type: TransactionType.EXPIRY,
        pointsDelta: -amountToExpire,
        description: `Expired points from ${candidate.description ?? "earn transaction"}`,
        expirySourceId: candidate.id,
        metadata: {
          expiredAt: input.now.toISOString(),
          sourceTransactionId: candidate.id
        }
      }
    });

    remainingBalance -= amountToExpire;
    pointsExpired += amountToExpire;
    transactionsCreated += 1;
  }

  if (pointsExpired <= 0) {
    return { transactionsCreated: 0, pointsExpired: 0 };
  }

  await tx.membership.update({
    where: {
      id: membership.id
    },
    data: {
      pointsBalance: {
        decrement: pointsExpired
      }
    }
  });

  await recalculateTier(tx, {
    membershipId: membership.id,
    actorUserId: input.actorUserId ?? null
  });

  await createNotificationInTx(tx, {
    userId: membership.userId,
    title: `Points expired at ${membership.business.name}`,
    body: `${pointsExpired} points expired from your wallet.`,
    type: "POINTS_EXPIRED",
    actionUrl: "/wallet"
  });

  return {
    transactionsCreated,
    pointsExpired
  };
}

const EXPIRE_PAGE_SIZE = 500;

const EXPIRE_WHERE = (now: Date) => ({
  isActive: true,
  pointsBalance: { gt: 0 },
  business: { deletedAt: null, isActive: true },
  transactions: {
    some: {
      expiresAt: { lte: now },
      pointsDelta: { gt: 0 },
      expiryTarget: null,
      refundTarget: null
    }
  }
});

export async function sendPointsExpiryWarnings(
  daysBeforeExpiry: number = 7,
  now: Date = new Date()
): Promise<{ warningsSent: number; membershipsWarned: number }> {
  const warningThreshold = new Date(
    now.getTime() + daysBeforeExpiry * 24 * 60 * 60 * 1000
  );

  const nowForQuery = now;
  const expiringTransactions = await withSystemScope((tx) =>
    tx.loyaltyTransaction.findMany({
      where: {
        type: "EARN",
        expiresAt: {
          gt: nowForQuery,
          lte: warningThreshold
        },
        expiryTarget: null,
        refundTarget: null
      },
      select: {
        id: true,
        pointsDelta: true,
        expiresAt: true,
        membership: {
          select: {
            id: true,
            userId: true,
            businessId: true,
            pointsBalance: true,
            business: {
              select: { name: true }
            }
          }
        }
      },
      orderBy: { expiresAt: "asc" }
    })
  );

  const byMembership = new Map<
    string,
    {
      membershipId: string;
      userId: string;
      businessId: string;
      businessName: string;
      pointsExpiring: number;
      earliestExpiry: Date;
    }
  >();

  for (const tx of expiringTransactions) {
    const m = tx.membership;
    const existing = byMembership.get(m.id);
    if (existing) {
      existing.pointsExpiring += tx.pointsDelta;
      if (tx.expiresAt && tx.expiresAt < existing.earliestExpiry) {
        existing.earliestExpiry = tx.expiresAt;
      }
    } else {
      byMembership.set(m.id, {
        membershipId: m.id,
        userId: m.userId,
        businessId: m.businessId,
        businessName: m.business.name,
        pointsExpiring: tx.pointsDelta,
        earliestExpiry: tx.expiresAt ?? warningThreshold
      });
    }
  }

  let warningsSent = 0;

  for (const warning of byMembership.values()) {
    try {
      await sendNotification({
        userId: warning.userId,
        businessId: warning.businessId,
        title: "Points expiring soon",
        body: `${warning.pointsExpiring} points at ${warning.businessName} will expire on ${warning.earliestExpiry.toLocaleDateString("en-ZA")}. Use them before they're gone!`,
        type: "POINTS_EXPIRING_SOON",
        actionUrl: `/b/${warning.businessId}/rewards`,
        metadata: {
          pointsExpiring: warning.pointsExpiring,
          earliestExpiry: warning.earliestExpiry.toISOString()
        }
      });
      warningsSent++;
    } catch (error) {
      logger.error(
        { err: error, membershipId: warning.membershipId },
        "loyalty.expiry_warning.send_failed"
      );
    }
  }

  logger.info(
    {
      membershipsFound: byMembership.size,
      warningsSent
    },
    "loyalty.expiry_warnings.sent"
  );

  return {
    warningsSent,
    membershipsWarned: byMembership.size
  };
}

export async function expireEligiblePoints(now = new Date()): Promise<ExpirePointsResult> {
  let cursor: string | undefined;
  let membershipsProcessed = 0;
  let transactionsCreated = 0;
  let pointsExpired = 0;

  while (true) {
    const memberships = await withSystemScope((tx) =>
      tx.membership.findMany({
        where: EXPIRE_WHERE(now),
        select: { id: true, businessId: true },
        take: EXPIRE_PAGE_SIZE,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {})
      })
    );

    if (memberships.length === 0) break;

    const lastMembership = memberships[memberships.length - 1];
    cursor = lastMembership?.id;

    for (const membership of memberships) {
      const result = await withBusinessScope(
        membership.businessId,
        (tx) =>
          expireMembershipPoints(tx, {
            membershipId: membership.id,
            businessId: membership.businessId,
            now
          })
      );

      if (result.transactionsCreated > 0) {
        membershipsProcessed += 1;
        transactionsCreated += result.transactionsCreated;
        pointsExpired += result.pointsExpired;
      }
    }

    if (memberships.length < EXPIRE_PAGE_SIZE) break;
  }

  return { membershipsProcessed, transactionsCreated, pointsExpired };
}

export type RecalcTiersResult = {
  total: number;
  fixed: number;
};

export async function recalculateMembershipTiers(): Promise<RecalcTiersResult> {
  const PAGE_SIZE = 500;
  let cursor: string | undefined;
  let total = 0;
  let fixed = 0;

  while (true) {
    const memberships = await withSystemScope((tx) =>
      tx.membership.findMany({
        where: { isActive: true, business: { deletedAt: null, isActive: true } },
        select: { id: true, businessId: true, pointsBalance: true, tierId: true },
        take: PAGE_SIZE,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {})
      })
    );

    if (memberships.length === 0) break;

    const lastMembership = memberships[memberships.length - 1];
    cursor = lastMembership?.id;
    total += memberships.length;

    const businessIds = [...new Set(memberships.map((m) => m.businessId))];
    const tiersByBusiness = await withSystemScope((tx) =>
      tx.loyaltyTier.findMany({
        where: { businessId: { in: businessIds } },
        orderBy: { minPoints: "asc" }
      })
    );

    const tierMap = new Map<string, typeof tiersByBusiness>();
    for (const tier of tiersByBusiness) {
      const existing = tierMap.get(tier.businessId);
      if (existing) {
        existing.push(tier);
      } else {
        tierMap.set(tier.businessId, [tier]);
      }
    }

    for (const membership of memberships) {
      try {
        const tiers = tierMap.get(membership.businessId) ?? [];
        const correctTier = tiers.reduce<(typeof tiers)[0] | null>((best, tier) => {
          if (membership.pointsBalance >= tier.minPoints) return tier;
          return best;
        }, null);
        const correctTierId = correctTier?.id ?? null;

        if (membership.tierId !== correctTierId) {
          await withBusinessScope(membership.businessId, (tx) =>
            tx.membership.update({
              where: { id: membership.id },
              data: { tierId: correctTierId }
            })
          );
          fixed += 1;
        }
      } catch (err) {
        logger.error({ err, membershipId: membership.id }, "tier_recalculation.row_error");
      }
    }

    if (memberships.length < PAGE_SIZE) break;
  }

  return { total, fixed };
}
