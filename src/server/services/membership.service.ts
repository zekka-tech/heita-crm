import { JoinChannel, TransactionType } from "@prisma/client";

import { calculatePointsExpiryDate } from "@/lib/loyalty";
import { withBusinessScope } from "@/lib/prisma";
import { captureEvent } from "@/lib/telemetry";
import { TELEMETRY_EVENTS } from "@/lib/telemetry-events";
import { resolveReferralCode } from "@/server/services/referral.service";

type JoinBusinessInput = {
  businessId: string;
  userId: string;
  joinChannel: JoinChannel;
  referralCode?: string | null;
};

export async function joinBusiness(input: JoinBusinessInput) {
  return withBusinessScope(input.businessId, async (tx) => {
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

    captureEvent({
      userId: input.userId,
      event: TELEMETRY_EVENTS.membershipJoined,
      properties: {
        businessId: business.id,
        joinChannel: input.joinChannel,
        referralUsed: !!referralCode,
        signupBonusPoints: business.loyaltySignupBonus
      }
    });

    return membership;
  });
}


export async function getCustomersSearch(businessId: string, query: string) {
  const q = query.trim();
  if (!q) return [];

  return withBusinessScope(businessId, (tx) =>
    tx.membership.findMany({
      where: {
        businessId,
        isActive: true,
        user: {
          deletedAt: null,
          OR: [
            { phone: { contains: q } },
            { name: { contains: q, mode: "insensitive" } }
          ]
        }
      },
      include: {
        user: { select: { id: true, name: true, phone: true } }
      },
      orderBy: { joinedAt: "desc" },
      take: 20
    })
  );
}
