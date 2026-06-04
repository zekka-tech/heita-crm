import { Prisma, TransactionType } from "@prisma/client";

import { analyticsKeysForBusiness, cacheDel } from "@/lib/data-cache";
import {
  applyTierPointMultiplier,
  calculatePointsExpiryDate,
  getTierPerks
} from "@/lib/loyalty";
import { runIdempotentOperation } from "@/lib/idempotency";
import { logger } from "@/lib/logger";
import { prisma, type PrismaTransactionClient } from "@/lib/prisma";
import { withSpan } from "@/lib/tracing";
import { applyReferralRewardIfEligible } from "@/server/services/referral.service";
import { recordStaffAuditLog } from "@/server/services/staff-audit.service";

type LoyaltyTx = PrismaTransactionClient;

const LOYALTY_TRANSACTION_OPTIONS = {
  maxWait: 5_000,
  timeout: 20_000
};

const REDEEM_TRANSACTION_OPTIONS = {
  ...LOYALTY_TRANSACTION_OPTIONS,
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable
};

const REFUNDABLE_TYPES = new Set<TransactionType>([
  TransactionType.EARN,
  TransactionType.SIGNUP_BONUS,
  TransactionType.ADJUSTMENT,
  TransactionType.REDEEM
]);

type EarnPointsInput = {
  businessId: string;
  membershipId: string;
  points: number;
  actorUserId: string;
  idempotencyKey: string;
  description?: string | null;
  staffAudit?: boolean;
};

type RedeemPointsInput =
  | {
      businessId: string;
      membershipId: string;
      actorUserId: string;
      idempotencyKey: string;
      rewardId: string;
      description?: string | null;
      staffAudit?: boolean;
    }
  | {
      businessId: string;
      membershipId: string;
      actorUserId: string;
      idempotencyKey: string;
      points: number;
      description?: string | null;
      staffAudit?: boolean;
    };

type RefundTransactionInput = {
  businessId: string;
  transactionId: string;
  actorUserId: string;
  idempotencyKey: string;
  description?: string | null;
  staffAudit?: boolean;
};

type ExpirePointsResult = {
  membershipsProcessed: number;
  transactionsCreated: number;
  pointsExpired: number;
};

type MembershipForLoyalty = Prisma.MembershipGetPayload<{
  include: {
    business: {
      include: {
        loyaltyTiers: {
          orderBy: {
            minPoints: "asc";
          };
        };
      };
    };
    tier: true;
    user: true;
  };
}>;

async function createNotificationInTx(
  tx: LoyaltyTx,
  input: {
    userId: string;
    title: string;
    body: string;
    type: string;
    actionUrl?: string | null;
    metadata?: Record<string, unknown>;
  }
) {
  return tx.notification.create({
    data: {
      userId: input.userId,
      title: input.title,
      body: input.body,
      type: input.type,
      actionUrl: input.actionUrl ?? null,
      metadata: input.metadata as Prisma.InputJsonValue | undefined
    }
  });
}

async function getMembershipForLoyalty(tx: LoyaltyTx, membershipId: string) {
  return tx.membership.findUniqueOrThrow({
    where: {
      id: membershipId
    },
    include: {
      business: {
        include: {
          loyaltyTiers: {
            orderBy: {
              minPoints: "asc"
            }
          }
        }
      },
      tier: true,
      user: true
    }
  });
}

function ensureBusinessOwnership(
  membership: { businessId: string },
  businessId: string
) {
  if (membership.businessId !== businessId) {
    throw new Error("Membership does not belong to this business.");
  }
}

export async function recalculateTier(
  tx: LoyaltyTx,
  input: { membershipId: string; actorUserId?: string | null }
) {
  const membership = await getMembershipForLoyalty(tx, input.membershipId);

  const previousTierId = membership.tierId;
  const nextTier =
    [...membership.business.loyaltyTiers]
      .reverse()
      .find((candidate) => membership.pointsBalance >= candidate.minPoints) ?? null;

  if (previousTierId === nextTier?.id) {
    return membership;
  }

  const updatedMembership = await tx.membership.update({
    where: {
      id: membership.id
    },
    data: {
      tierId: nextTier?.id ?? null
    },
    include: {
      tier: true,
      business: true
    }
  });

  if (nextTier) {
    await createNotificationInTx(tx, {
      userId: membership.userId,
      title: `Tier updated: ${nextTier.name}`,
      body: `Your ${membership.business.name} membership is now ${nextTier.name}.`,
      type: "TIER_UPGRADE",
      actionUrl: `/b/${membership.business.slug}/rewards`,
      metadata: {
        membershipId: membership.id,
        tierId: nextTier.id
      }
    });
  }

  return updatedMembership;
}

function createEarnTransactionData(input: {
  membership: MembershipForLoyalty;
  actorUserId: string;
  basePoints: number;
  description?: string | null;
}) {
  const awardedPoints = applyTierPointMultiplier({
    basePoints: input.basePoints,
    perks: input.membership.tier?.perks
  });

  return {
    awardedPoints,
    expiresAt: calculatePointsExpiryDate({
      expiryDays: input.membership.business.pointsExpiryDays
    }),
    tierPerks: getTierPerks(input.membership.tier?.perks),
    description: input.description || "Points earned"
  };
}

export async function earnPoints(input: EarnPointsInput) {
  const result = await withSpan("loyalty.earn_points", { "business.id": input.businessId, points: input.points }, () =>
    _earnPoints(input)
  );
  // Bust all analytics windows so staff immediately see the transaction they just issued.
  cacheDel(...analyticsKeysForBusiness(input.businessId)).catch(() => undefined);
  return result;
}

async function _earnPoints(input: EarnPointsInput) {
  if (!Number.isFinite(input.points) || input.points <= 0) {
    throw new Error("Points to earn must be greater than zero.");
  }

  return runIdempotentOperation({
    scope: `loyalty:earn:${input.businessId}:${input.membershipId}`,
    key: input.idempotencyKey,
    execute: async () =>
      prisma.$transaction(
        async (tx) => {
          const membership = await getMembershipForLoyalty(tx, input.membershipId);
          ensureBusinessOwnership(membership, input.businessId);

          const earnData = createEarnTransactionData({
            membership,
            actorUserId: input.actorUserId,
            basePoints: input.points,
            description: input.description
          });

          const updatedMembership = await tx.membership.update({
            where: {
              id: membership.id
            },
            data: {
              pointsBalance: {
                increment: earnData.awardedPoints
              }
            }
          });

          const transaction = await tx.loyaltyTransaction.create({
            data: {
              businessId: membership.businessId,
              membershipId: membership.id,
              userId: input.actorUserId,
              type: TransactionType.EARN,
              pointsDelta: earnData.awardedPoints,
              description: earnData.description,
              expiresAt: earnData.expiresAt,
              metadata: {
                basePoints: input.points,
                pointMultiplier: earnData.tierPerks.pointMultiplier ?? 1
              }
            }
          });

          const referralReward = await applyReferralRewardIfEligible(tx, {
            membershipId: membership.id
          });

          if (referralReward) {
            await recalculateTier(tx, {
              membershipId: referralReward.referrerMembershipId
            });
          }

          if (input.staffAudit) {
            await recordStaffAuditLog(
              {
                businessId: membership.businessId,
                actorUserId: input.actorUserId,
                action: "LOYALTY_EARN",
                targetType: "Membership",
                targetId: membership.id,
                metadata: {
                  loyaltyTransactionId: transaction.id,
                  awardedPoints: earnData.awardedPoints,
                  basePoints: input.points,
                  pointMultiplier: earnData.tierPerks.pointMultiplier ?? 1
                }
              },
              tx
            );
          }

          await recalculateTier(tx, {
            membershipId: membership.id,
            actorUserId: input.actorUserId
          });

          return updatedMembership;
        },
        LOYALTY_TRANSACTION_OPTIONS
      ),
    replay: async () =>
      prisma.membership.findUniqueOrThrow({
        where: {
          id: input.membershipId
        }
      })
  });
}

export async function redeemPoints(input: RedeemPointsInput) {
  const result = await withSpan("loyalty.redeem_points", { "business.id": input.businessId }, () =>
    _redeemPoints(input)
  );
  cacheDel(...analyticsKeysForBusiness(input.businessId)).catch(() => undefined);
  return result;
}

async function _redeemPoints(input: RedeemPointsInput) {
  return runIdempotentOperation({
    scope: `loyalty:redeem:${input.businessId}:${input.membershipId}`,
    key: input.idempotencyKey,
    execute: async () =>
      prisma.$transaction(
        async (tx) => {
          const membership = await getMembershipForLoyalty(tx, input.membershipId);
          ensureBusinessOwnership(membership, input.businessId);

          let pointsToRedeem = 0;
          let description = input.description || "Points redeemed";
          let rewardMetadata: Record<string, unknown> | null = null;

          if ("rewardId" in input) {
            const reward = await tx.reward.findFirstOrThrow({
              where: {
                id: input.rewardId,
                businessId: input.businessId,
                isActive: true
              }
            });

            pointsToRedeem = reward.pointsCost;
            description = input.description || `Redeemed reward: ${reward.title}`;
            rewardMetadata = {
              rewardId: reward.id,
              rewardTitle: reward.title
            };

            if (reward.stock !== null && reward.stock <= 0) {
              throw new Error("That reward is out of stock.");
            }

            await tx.reward.update({
              where: {
                id: reward.id
              },
              data: {
                stock: reward.stock === null ? null : { decrement: 1 }
              }
            });
          } else {
            pointsToRedeem = input.points;
          }

          if (!Number.isFinite(pointsToRedeem) || pointsToRedeem <= 0) {
            throw new Error("Points to redeem must be greater than zero.");
          }

          if (membership.pointsBalance < pointsToRedeem) {
            throw new Error("Insufficient points balance.");
          }

          const updatedMembership = await tx.membership.update({
            where: {
              id: membership.id
            },
            data: {
              pointsBalance: {
                decrement: pointsToRedeem
              }
            }
          });

          const transaction = await tx.loyaltyTransaction.create({
            data: {
              businessId: membership.businessId,
              membershipId: membership.id,
              userId: input.actorUserId,
              type: TransactionType.REDEEM,
              pointsDelta: -pointsToRedeem,
              description,
              metadata: rewardMetadata as Prisma.InputJsonValue | undefined
            }
          });

          if (input.staffAudit) {
            await recordStaffAuditLog(
              {
                businessId: membership.businessId,
                actorUserId: input.actorUserId,
                action: "LOYALTY_REDEEM",
                targetType: "Membership",
                targetId: membership.id,
                metadata: {
                  loyaltyTransactionId: transaction.id,
                  pointsRedeemed: pointsToRedeem,
                  rewardId:
                    rewardMetadata && typeof rewardMetadata.rewardId === "string"
                      ? rewardMetadata.rewardId
                      : null
                }
              },
              tx
            );
          }

          await recalculateTier(tx, {
            membershipId: membership.id,
            actorUserId: input.actorUserId
          });

          await createNotificationInTx(tx, {
            userId: membership.userId,
            title: `Points redeemed at ${membership.business.name}`,
            body: `${pointsToRedeem} points were redeemed from your wallet.`,
            type: "POINTS_REDEEMED",
            actionUrl: `/wallet`
          });

          return updatedMembership;
        },
        REDEEM_TRANSACTION_OPTIONS
      ),
    replay: async () =>
      prisma.membership.findUniqueOrThrow({
        where: {
          id: input.membershipId
        }
      })
  });
}

export async function refundTransaction(input: RefundTransactionInput) {
  const result = await withSpan("loyalty.refund_transaction", { "business.id": input.businessId, "transaction.id": input.transactionId }, () =>
    _refundTransaction(input)
  );
  cacheDel(...analyticsKeysForBusiness(input.businessId)).catch(() => undefined);
  return result;
}

async function _refundTransaction(input: RefundTransactionInput) {
  return runIdempotentOperation({
    scope: `loyalty:refund:${input.businessId}:${input.transactionId}`,
    key: input.idempotencyKey,
    execute: async () =>
      prisma.$transaction(
        async (tx) => {
          const sourceTransaction = await tx.loyaltyTransaction.findUniqueOrThrow({
            where: {
              id: input.transactionId
            },
            include: {
              membership: {
                include: {
                  business: true,
                  user: true
                }
              },
              refundTarget: true
            }
          });

          if (sourceTransaction.businessId !== input.businessId) {
            throw new Error("Transaction does not belong to this business.");
          }

          if (!REFUNDABLE_TYPES.has(sourceTransaction.type)) {
            throw new Error("This transaction type cannot be refunded.");
          }

          if (sourceTransaction.refundTarget) {
            throw new Error("This transaction has already been refunded.");
          }

          const pointsDelta = -sourceTransaction.pointsDelta;
          const nextBalance = sourceTransaction.membership.pointsBalance + pointsDelta;

          if (nextBalance < 0) {
            throw new Error(
              "The member does not have enough remaining points to reverse this transaction."
            );
          }

          await tx.membership.update({
            where: {
              id: sourceTransaction.membershipId
            },
            data: {
              pointsBalance: {
                increment: pointsDelta
              }
            }
          });

          const sourceMetadata =
            sourceTransaction.metadata &&
            typeof sourceTransaction.metadata === "object" &&
            !Array.isArray(sourceTransaction.metadata)
              ? (sourceTransaction.metadata as Record<string, unknown>)
              : {};

          if (
            sourceTransaction.type === TransactionType.REDEEM &&
            typeof sourceMetadata.rewardId === "string"
          ) {
            const reward = await tx.reward.findUnique({
              where: {
                id: sourceMetadata.rewardId
              }
            });

            if (reward?.stock !== null && reward?.stock !== undefined) {
              await tx.reward.update({
                where: {
                  id: reward.id
                },
                data: {
                  stock: {
                    increment: 1
                  }
                }
              });
            }
          }

          const refund = await tx.loyaltyTransaction.create({
            data: {
              businessId: sourceTransaction.businessId,
              membershipId: sourceTransaction.membershipId,
              userId: input.actorUserId,
              type: TransactionType.REFUND,
              pointsDelta,
              description:
                input.description ||
                `Refund for ${sourceTransaction.description ?? sourceTransaction.type}`,
              refundSourceId: sourceTransaction.id,
              metadata: {
                originalType: sourceTransaction.type,
                originalDescription: sourceTransaction.description
              }
            }
          });

          if (input.staffAudit) {
            await recordStaffAuditLog(
              {
                businessId: sourceTransaction.businessId,
                actorUserId: input.actorUserId,
                action: "LOYALTY_REFUND",
                targetType: "LoyaltyTransaction",
                targetId: sourceTransaction.id,
                metadata: {
                  refundTransactionId: refund.id,
                  pointsReturned: pointsDelta,
                  membershipId: sourceTransaction.membershipId
                }
              },
              tx
            );
          }

          await recalculateTier(tx, {
            membershipId: sourceTransaction.membershipId,
            actorUserId: input.actorUserId
          });

          await createNotificationInTx(tx, {
            userId: sourceTransaction.membership.userId,
            title: `Refund processed at ${sourceTransaction.membership.business.name}`,
            body: `${Math.abs(pointsDelta)} points were returned to your wallet.`,
            type: "POINTS_REFUNDED",
            actionUrl: "/wallet",
            metadata: {
              sourceTransactionId: sourceTransaction.id,
              refundTransactionId: refund.id
            }
          });

          return refund;
        },
        LOYALTY_TRANSACTION_OPTIONS
      ),
    replay: async () =>
      prisma.loyaltyTransaction.findFirstOrThrow({
        where: {
          businessId: input.businessId,
          refundSourceId: input.transactionId
        }
      })
  });
}

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

export async function expireEligiblePoints(now = new Date()): Promise<ExpirePointsResult> {
  let cursor: string | undefined;
  let membershipsProcessed = 0;
  let transactionsCreated = 0;
  let pointsExpired = 0;

  while (true) {
    const memberships = await prisma.membership.findMany({
      where: EXPIRE_WHERE(now),
      select: { id: true, businessId: true },
      take: EXPIRE_PAGE_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {})
    });

    if (memberships.length === 0) break;

    const lastMembership = memberships[memberships.length - 1];
    cursor = lastMembership?.id;

    for (const membership of memberships) {
      const result = await prisma.$transaction(
        (tx) =>
          expireMembershipPoints(tx, {
            membershipId: membership.id,
            businessId: membership.businessId,
            now
          }),
        LOYALTY_TRANSACTION_OPTIONS
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
    const memberships = await prisma.membership.findMany({
      where: { isActive: true, business: { deletedAt: null, isActive: true } },
      select: { id: true, businessId: true, pointsBalance: true, tierId: true },
      take: PAGE_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {})
    });

    if (memberships.length === 0) break;

    const lastMembership = memberships[memberships.length - 1];
    cursor = lastMembership?.id;
    total += memberships.length;

    const businessIds = [...new Set(memberships.map((m) => m.businessId))];
    const tiersByBusiness = await prisma.loyaltyTier.findMany({
      where: { businessId: { in: businessIds } },
      orderBy: { minPoints: "asc" }
    });

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
          await prisma.membership.update({
            where: { id: membership.id },
            data: { tierId: correctTierId }
          });
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
