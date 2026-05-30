import { JoinChannel, TransactionType } from "@prisma/client";

import { calculatePointsExpiryDate } from "@/lib/loyalty";
import { prisma } from "@/lib/prisma";
import { resolveReferralCode } from "@/server/services/referral.service";

type JoinBusinessInput = {
  businessId: string;
  userId: string;
  joinChannel: JoinChannel;
  referralCode?: string | null;
};

export async function joinBusiness(input: JoinBusinessInput) {
  return prisma.$transaction(async (tx) => {
    const existingMembership = await tx.membership.findUnique({
      where: {
        businessId_userId: {
          businessId: input.businessId,
          userId: input.userId
        }
      }
    });

    if (existingMembership) {
      return existingMembership;
    }

    const business = await tx.business.findUniqueOrThrow({
      where: {
        id: input.businessId
      },
      include: {
        loyaltyTiers: {
          orderBy: {
            minPoints: "asc"
          }
        }
      }
    });

    const pointsBalance = business.loyaltySignupBonus;
    const tier =
      [...business.loyaltyTiers]
        .reverse()
        .find((candidate) => pointsBalance >= candidate.minPoints) ?? null;
    const referralCode = input.referralCode
      ? await resolveReferralCode({
          businessId: business.id,
          code: input.referralCode,
          referredUserId: input.userId,
          tx
        })
      : null;

    const membership = await tx.membership.create({
      data: {
        businessId: business.id,
        userId: input.userId,
        joinChannel: input.joinChannel,
        pointsBalance,
        tierId: tier?.id ?? null,
        referredByCodeId: referralCode?.id ?? null
      }
    });

    if (business.loyaltySignupBonus > 0) {
      await tx.loyaltyTransaction.create({
        data: {
          businessId: business.id,
          membershipId: membership.id,
          userId: input.userId,
          type: TransactionType.SIGNUP_BONUS,
          pointsDelta: business.loyaltySignupBonus,
          description: "Welcome bonus",
          expiresAt: calculatePointsExpiryDate({
            expiryDays: business.pointsExpiryDays
          })
        }
      });
    }

    await tx.notification.create({
      data: {
        userId: input.userId,
        title: `Joined ${business.name}`,
        body:
          business.loyaltySignupBonus > 0
            ? `Welcome to ${business.name}. You received ${business.loyaltySignupBonus} points.`
            : `Welcome to ${business.name}.`,
        type: "MEMBERSHIP_JOINED",
        actionUrl: `/b/${business.slug}`
      }
    });

    return membership;
  }, { maxWait: 5000, timeout: 10000 });
}
