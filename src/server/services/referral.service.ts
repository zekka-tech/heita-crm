import { randomBytes } from "node:crypto";

import { Prisma, TransactionType } from "@prisma/client";

import { withBusinessScope, type PrismaTransactionClient } from "@/lib/prisma";
import { withSpan } from "@/lib/tracing";

const DEFAULT_REFERRAL_BONUS_POINTS = 50;
const REFERRAL_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const REFERRAL_CODE_LENGTH = 8;

function generateReferralCodeValue() {
  const bytes = randomBytes(REFERRAL_CODE_LENGTH);
  let code = "";

  for (const byte of bytes) {
    code += REFERRAL_CODE_ALPHABET[byte % REFERRAL_CODE_ALPHABET.length];
  }

  return code;
}

export async function getOrCreateReferralCode(input: {
  businessId: string;
  ownerUserId: string;
}) {
  // ReferralCode is business-scoped: read/write under the owning business so
  // RLS resolves the row under the app role.
  // Check first to avoid burning a code on every call for users who already have one.
  const existing = await withBusinessScope(input.businessId, (tx) =>
    tx.referralCode.findUnique({
      where: {
        businessId_ownerUserId: {
          businessId: input.businessId,
          ownerUserId: input.ownerUserId
        }
      }
    })
  );

  if (existing) {
    return existing;
  }

  // Two concurrent first-time requests may both reach here. Use upsert so the
  // second writer just returns the record created by the first.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = generateReferralCodeValue();
    try {
      return await withBusinessScope(input.businessId, (tx) =>
        tx.referralCode.upsert({
          where: {
            businessId_ownerUserId: {
              businessId: input.businessId,
              ownerUserId: input.ownerUserId
            }
          },
          update: {},
          create: {
            businessId: input.businessId,
            ownerUserId: input.ownerUserId,
            code
          }
        })
      );
    } catch (error) {
      // P2002 on the `code` unique index — try a different code value
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        continue;
      }
      throw error;
    }
  }

  throw new Error("Unable to generate a unique referral code.");
}

export async function resolveReferralCode(input: {
  businessId: string;
  code: string;
  referredUserId: string;
  tx?: PrismaTransactionClient;
}) {
  const normalizedCode = input.code.trim().toUpperCase();

  if (!normalizedCode) {
    return null;
  }

  const findReferralCode = (client: PrismaTransactionClient) =>
    client.referralCode.findFirst({
      where: {
        businessId: input.businessId,
        code: normalizedCode,
        isActive: true
      }
    });

  // ReferralCode is tenant-scoped under FORCE RLS. Use the caller's scoped tx
  // when provided; otherwise open our own business scope so the lookup doesn't
  // silently return 0 rows under the app role.
  const referralCode = input.tx
    ? await findReferralCode(input.tx)
    : await withBusinessScope(input.businessId, findReferralCode);

  if (!referralCode || referralCode.ownerUserId === input.referredUserId) {
    return null;
  }

  return referralCode;
}

export async function applyReferralRewardIfEligible(
  tx: PrismaTransactionClient,
  input: {
    membershipId: string;
  }
) {
  return withSpan("referral.apply_reward", { "membership.id": input.membershipId }, () =>
    _applyReferralRewardIfEligible(tx, input)
  );
}

async function _applyReferralRewardIfEligible(
  tx: PrismaTransactionClient,
  input: {
    membershipId: string;
  }
) {
  const membership = await tx.membership.findUnique({
    where: { id: input.membershipId },
    include: {
      business: true,
      referredByCode: true
    }
  });

  if (
    !membership ||
    !membership.referredByCodeId ||
    membership.referralRewardedAt ||
    !membership.referredByCode
  ) {
    return null;
  }

  const referrerMembership = await tx.membership.findUnique({
    where: {
      businessId_userId: {
        businessId: membership.businessId,
        userId: membership.referredByCode.ownerUserId
      }
    }
  });

  if (!referrerMembership || !referrerMembership.isActive) {
    return null;
  }

  const points = Math.max(
    DEFAULT_REFERRAL_BONUS_POINTS,
    membership.business.loyaltySignupBonus
  );
  const rewardedAt = new Date();

  await tx.membership.update({
    where: { id: referrerMembership.id },
    data: {
      pointsBalance: {
        increment: points
      }
    }
  });

  const transaction = await tx.loyaltyTransaction.create({
    data: {
      businessId: membership.businessId,
      membershipId: referrerMembership.id,
      userId: membership.referredByCode.ownerUserId,
      type: TransactionType.REFERRAL_BONUS,
      pointsDelta: points,
      description: "Referral bonus",
      metadata: {
        referredMembershipId: membership.id,
        referralCode: membership.referredByCode.code
      }
    }
  });

  await tx.membership.update({
    where: { id: membership.id },
    data: {
      referralRewardedAt: rewardedAt
    }
  });

  await tx.notification.create({
    data: {
      userId: membership.referredByCode.ownerUserId,
      title: `Referral bonus from ${membership.business.name}`,
      body: `You earned ${points} points after your referral made their first purchase.`,
      type: "REFERRAL_BONUS",
      actionUrl: `/b/${membership.business.slug}/rewards`,
      metadata: {
        referralCode: membership.referredByCode.code,
        membershipId: referrerMembership.id,
        transactionId: transaction.id
      }
    }
  });

  return {
    points,
    transactionId: transaction.id,
    referrerMembershipId: referrerMembership.id
  };
}
