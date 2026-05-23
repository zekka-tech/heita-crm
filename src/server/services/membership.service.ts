import { JoinChannel, TransactionType } from "@prisma/client";

import { prisma } from "@/lib/prisma";

type JoinBusinessInput = {
  businessId: string;
  userId: string;
  joinChannel: JoinChannel;
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

    const membership = await tx.membership.create({
      data: {
        businessId: business.id,
        userId: input.userId,
        joinChannel: input.joinChannel,
        pointsBalance,
        tierId: tier?.id ?? null
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
          description: "Welcome bonus"
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
  });
}
