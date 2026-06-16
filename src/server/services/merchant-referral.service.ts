import { randomBytes } from "node:crypto";

import { Prisma } from "@prisma/client";

import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { withSystemScope } from "@/lib/prisma";

/**
 * B2B merchant referral loop.
 *
 * A merchant shares its referral code; another merchant enters it at onboarding.
 * When that referred business pays its first invoice, the referrer earns Rand
 * account credit (see `merchant-credit.service`). These records link two
 * businesses, so they are cross-tenant by nature and accessed only via
 * `withSystemScope`.
 */

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 8;

function generateCode() {
  const bytes = randomBytes(CODE_LENGTH);
  let code = "";
  for (const byte of bytes) {
    code += CODE_ALPHABET[byte % CODE_ALPHABET.length];
  }
  return code;
}

export function merchantReferralRewardZar(): number {
  return env.MERCHANT_REFERRAL_REWARD_ZAR;
}

export async function getOrCreateMerchantReferralCode(businessId: string) {
  return withSystemScope(async (tx) => {
    const existing = await tx.merchantReferralCode.findUnique({
      where: { ownerBusinessId: businessId }
    });
    if (existing) return existing;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        return await tx.merchantReferralCode.upsert({
          where: { ownerBusinessId: businessId },
          update: {},
          create: { ownerBusinessId: businessId, code: generateCode() }
        });
      } catch (error) {
        // P2002 on the global `code` unique index — retry with a new value.
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          continue;
        }
        throw error;
      }
    }
    throw new Error("Unable to generate a unique merchant referral code.");
  });
}

/**
 * Record that `referredBusinessId` was acquired via `codeValue`. Called once,
 * at onboarding, after the referred business exists. No-op (returns null) when
 * the code is unknown/inactive, the business self-refers, or a referral already
 * exists for the referred business (unique constraint).
 */
export async function captureMerchantReferral(input: {
  codeValue: string;
  referredBusinessId: string;
}) {
  const normalized = input.codeValue.trim().toUpperCase();
  if (!normalized) return null;

  return withSystemScope(async (tx) => {
    const code = await tx.merchantReferralCode.findFirst({
      where: { code: normalized, isActive: true }
    });
    if (!code || code.ownerBusinessId === input.referredBusinessId) {
      return null;
    }

    try {
      return await tx.merchantReferral.create({
        data: {
          codeId: code.id,
          referrerBusinessId: code.ownerBusinessId,
          referredBusinessId: input.referredBusinessId
        }
      });
    } catch (error) {
      // Already referred (unique on referredBusinessId) — keep first attribution.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return null;
      }
      throw error;
    }
  });
}

/**
 * Settle a pending referral when its referred business converts (first paid
 * invoice). Idempotent: only a PENDING referral is rewarded, and it flips to
 * REWARDED so later payments no-op. Credits the referrer and notifies its owner.
 * Returns the granted reward, or null when there is nothing to settle.
 */
export async function settleMerchantReferralForReferred(referredBusinessId: string) {
  const rewardZar = merchantReferralRewardZar();

  return withSystemScope(async (tx) => {
    const referral = await tx.merchantReferral.findUnique({
      where: { referredBusinessId },
      include: { referrerBusiness: { select: { id: true, name: true } } }
    });

    if (!referral || referral.status !== "PENDING") {
      return null;
    }

    const now = new Date();
    await tx.merchantReferral.update({
      where: { id: referral.id },
      data: { status: "REWARDED", rewardAmountZar: rewardZar, convertedAt: now, rewardedAt: now }
    });

    if (rewardZar > 0) {
      await tx.merchantCreditLedger.create({
        data: {
          businessId: referral.referrerBusinessId,
          amountZar: rewardZar,
          type: "REFERRAL_REWARD",
          description: "Referral reward — a business you referred started paying.",
          referralId: referral.id
        }
      });

      const owner = await tx.staffMember.findFirst({
        where: { businessId: referral.referrerBusinessId, role: "OWNER" },
        select: { userId: true }
      });
      if (owner) {
        await tx.notification.create({
          data: {
            userId: owner.userId,
            title: "You earned referral credit",
            body: `A business you referred just started paying. R${rewardZar} credit was added to ${referral.referrerBusiness.name}.`,
            type: "REFERRAL_BONUS",
            actionUrl: `/dashboard/${referral.referrerBusinessId}/settings/referrals`,
            metadata: { referralId: referral.id, rewardZar }
          }
        });
      }
    }

    logger.info(
      { referralId: referral.id, referrerBusinessId: referral.referrerBusinessId, rewardZar },
      "merchant_referral.settled"
    );

    return { referralId: referral.id, referrerBusinessId: referral.referrerBusinessId, rewardZar };
  });
}

export async function listReferralsMadeByBusiness(businessId: string) {
  return withSystemScope((tx) =>
    tx.merchantReferral.findMany({
      where: { referrerBusinessId: businessId },
      include: { referredBusiness: { select: { name: true, createdAt: true } } },
      orderBy: { createdAt: "desc" },
      take: 100
    })
  );
}
