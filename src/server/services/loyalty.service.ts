import { Prisma, TransactionType } from "@prisma/client";

import { runIdempotentOperation } from "@/lib/idempotency";
import { prisma } from "@/lib/prisma";

type LoyaltyTx = Prisma.TransactionClient;

const LOYALTY_TRANSACTION_OPTIONS = {
  maxWait: 5_000,
  timeout: 20_000
};

type EarnPointsInput = {
  businessId: string;
  membershipId: string;
  points: number;
  actorUserId: string;
  idempotencyKey: string;
  description?: string | null;
};

type RedeemPointsInput =
  | {
      businessId: string;
      membershipId: string;
      actorUserId: string;
      idempotencyKey: string;
      rewardId: string;
      description?: string | null;
    }
  | {
      businessId: string;
      membershipId: string;
      actorUserId: string;
      idempotencyKey: string;
      points: number;
      description?: string | null;
    };

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

export async function recalculateTier(
  tx: LoyaltyTx,
  input: { membershipId: string; actorUserId?: string | null }
) {
  const membership = await tx.membership.findUniqueOrThrow({
    where: {
      id: input.membershipId
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

export async function earnPoints(input: EarnPointsInput) {
  if (!Number.isFinite(input.points) || input.points <= 0) {
    throw new Error("Points to earn must be greater than zero.");
  }

  return runIdempotentOperation({
    scope: `loyalty:earn:${input.businessId}:${input.membershipId}`,
    key: input.idempotencyKey,
    execute: async () =>
      prisma.$transaction(
        async (tx) => {
          const membership = await tx.membership.findUniqueOrThrow({
            where: {
              id: input.membershipId
            },
            include: {
              business: true
            }
          });

          if (membership.businessId !== input.businessId) {
            throw new Error("Membership does not belong to this business.");
          }

          const updatedMembership = await tx.membership.update({
            where: {
              id: membership.id
            },
            data: {
              pointsBalance: {
                increment: input.points
              }
            }
          });

          await tx.loyaltyTransaction.create({
            data: {
              businessId: membership.businessId,
              membershipId: membership.id,
              userId: input.actorUserId,
              type: TransactionType.EARN,
              pointsDelta: input.points,
              description: input.description || "Points earned"
            }
          });

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
  return runIdempotentOperation({
    scope: `loyalty:redeem:${input.businessId}:${input.membershipId}`,
    key: input.idempotencyKey,
    execute: async () =>
      prisma.$transaction(
        async (tx) => {
          const membership = await tx.membership.findUniqueOrThrow({
            where: {
              id: input.membershipId
            },
            include: {
              business: true
            }
          });

          if (membership.businessId !== input.businessId) {
            throw new Error("Membership does not belong to this business.");
          }

          let pointsToRedeem = 0;
          let description = input.description || "Points redeemed";

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

          await tx.loyaltyTransaction.create({
            data: {
              businessId: membership.businessId,
              membershipId: membership.id,
              userId: input.actorUserId,
              type: TransactionType.REDEEM,
              pointsDelta: -pointsToRedeem,
              description
            }
          });

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
