import { Prisma, TransactionType } from "@prisma/client";

import { analyticsKeysForBusiness, cacheDel } from "@/lib/data-cache";
import { captureEvent } from "@/lib/telemetry";
import {
  applyTierPointMultiplier,
  calculatePointsExpiryDate,
  getTierPerks
} from "@/lib/loyalty";
import { runIdempotentOperation } from "@/lib/idempotency";
import { withBusinessScope } from "@/lib/prisma";
import { withSpan } from "@/lib/tracing";
import { applyReferralRewardIfEligible } from "@/server/services/referral.service";
import { recordStaffAuditLog } from "@/server/services/staff-audit.service";
import {
  createNotificationInTx,
  ensureBusinessOwnership,
  getMembershipForLoyalty,
  recalculateTier,
  type MembershipForLoyalty
} from "@/server/services/loyalty-internal";

// recalculateTier lives in loyalty-internal (shared with the batch jobs) but is
// part of this service's public surface, so re-export it here.
export { recalculateTier } from "@/server/services/loyalty-internal";

// Batch / cron loyalty maintenance lives in loyalty-jobs.service; re-export it
// so existing `@/server/services/loyalty.service` imports keep working.
export {
  expireEligiblePoints,
  recalculateMembershipTiers,
  sendPointsExpiryWarnings,
  type ExpirePointsResult,
  type RecalcTiersResult
} from "@/server/services/loyalty-jobs.service";

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
  cacheDel(...analyticsKeysForBusiness(input.businessId)).catch(() => undefined);
  captureEvent({ userId: input.actorUserId, event: "loyalty.points_earned", properties: { businessId: input.businessId, points: input.points } });
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
      withBusinessScope(
        input.businessId,
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
        }
      ),
    replay: async () =>
      // Idempotency replay runs outside the main scoped transaction, so it must
      // re-enter business scope to satisfy RLS under the app role.
      withBusinessScope(input.businessId, (tx) =>
        tx.membership.findUniqueOrThrow({
          where: {
            id: input.membershipId
          }
        })
      )
  });
}

export async function redeemPoints(input: RedeemPointsInput) {
  const result = await withSpan("loyalty.redeem_points", { "business.id": input.businessId }, () =>
    _redeemPoints(input)
  );
  cacheDel(...analyticsKeysForBusiness(input.businessId)).catch(() => undefined);
  captureEvent({
    userId: input.actorUserId,
    event: "loyalty.points_redeemed",
    properties: {
      businessId: input.businessId,
      ...("rewardId" in input ? { rewardId: input.rewardId } : { points: input.points }),
    },
  });
  return result;
}

async function _redeemPoints(input: RedeemPointsInput) {
  return runIdempotentOperation({
    scope: `loyalty:redeem:${input.businessId}:${input.membershipId}`,
    key: input.idempotencyKey,
    execute: async () =>
      withBusinessScope(
        input.businessId,
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
        }
      ),
    replay: async () =>
      // Idempotency replay runs outside the main scoped transaction, so it must
      // re-enter business scope to satisfy RLS under the app role.
      withBusinessScope(input.businessId, (tx) =>
        tx.membership.findUniqueOrThrow({
          where: {
            id: input.membershipId
          }
        })
      )
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
      withBusinessScope(
        input.businessId,
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
        }
      ),
    replay: async () =>
      // Idempotency replay runs outside the main scoped transaction, so it must
      // re-enter business scope to satisfy RLS under the app role.
      withBusinessScope(input.businessId, (tx) =>
        tx.loyaltyTransaction.findFirstOrThrow({
          where: {
            businessId: input.businessId,
            refundSourceId: input.transactionId
          }
        })
      )
  });
}
