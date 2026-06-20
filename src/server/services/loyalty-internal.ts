import { Prisma } from "@prisma/client";

import { type PrismaTransactionClient } from "@/lib/prisma";

// Shared loyalty internals used by both the core member operations
// (loyalty.service) and the batch/cron jobs (loyalty-jobs.service). Every helper
// here operates on a caller-provided scoped transaction (`tx`) so it inherits
// the tenant RLS scope opened by withBusinessScope/withSystemScope upstream.
export type LoyaltyTx = PrismaTransactionClient;

export type MembershipForLoyalty = Prisma.MembershipGetPayload<{
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

export async function createNotificationInTx(
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
  // createMany (no RETURNING) so the insert is not subject to a SELECT policy.
  // Notification has no business-scope SELECT policy by design, so a plain
  // create() under withBusinessScope would fail when hydrating the result row.
  return tx.notification.createMany({
    data: [
      {
        userId: input.userId,
        title: input.title,
        body: input.body,
        type: input.type,
        actionUrl: input.actionUrl ?? null,
        metadata: input.metadata as Prisma.InputJsonValue | undefined
      }
    ]
  });
}

export async function getMembershipForLoyalty(tx: LoyaltyTx, membershipId: string) {
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

export function ensureBusinessOwnership(
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
  } else if (previousTierId !== null) {
    await createNotificationInTx(tx, {
      userId: membership.userId,
      title: "Membership tier removed",
      body: `Your ${membership.business.name} loyalty tier has been removed.`,
      type: "TIER_DOWNGRADE",
      actionUrl: `/b/${membership.business.slug}/rewards`,
      metadata: { membershipId: membership.id }
    });
  }

  return updatedMembership;
}
