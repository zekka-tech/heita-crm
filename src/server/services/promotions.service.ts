import { ConsentType, MessageChannel, Prisma, PromotionType, StaffRole } from "@prisma/client";

import { isFeatureEnabled } from "@/lib/feature-flags";
import { logger } from "@/lib/logger";
import { shouldDeliverNotificationChannel } from "@/lib/notification-preferences";
import { withBusinessScope } from "@/lib/prisma";
import { requireRole } from "@/lib/staff";
import {
  assertOutboundMessageQuota,
  MessageQuotaExceededError
} from "@/server/services/message-usage.service";
import { sendNotification } from "@/server/services/notification.service";
import { recordStaffAuditLog } from "@/server/services/staff-audit.service";
import { sendPromotionWhatsApp } from "@/server/services/whatsapp.service";

const STAFF_VIEW_ROLES = [
  StaffRole.OWNER,
  StaffRole.MANAGER,
  StaffRole.STAFF
] as const;

const MANAGER_ROLES = [StaffRole.MANAGER] as const;

export type ListPromotionsInput = {
  businessId: string;
  userId: string;
  limit?: number;
  cursor?: string;
};

export async function listPromotions(input: ListPromotionsInput) {
  await requireRole({
    businessId: input.businessId,
    userId: input.userId,
    allowedRoles: STAFF_VIEW_ROLES
  });

  return withBusinessScope(input.businessId, (tx) =>
    tx.promotion.findMany({
      where: { businessId: input.businessId },
      orderBy: { startsAt: "desc" },
      take: input.limit ?? 50,
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {})
    })
  );
}

export type CreatePromotionInput = {
  businessId: string;
  actorUserId: string;
  title: string;
  description?: string | null;
  type: PromotionType;
  startsAt: Date;
  endsAt: Date;
  imageUrl?: string | null;
  code?: string | null;
  targetTierIds?: string[];
};

function assertDateWindow(startsAt: Date, endsAt: Date) {
  if (!(startsAt instanceof Date) || Number.isNaN(startsAt.getTime())) {
    throw new Error("Promotion start date is invalid.");
  }
  if (!(endsAt instanceof Date) || Number.isNaN(endsAt.getTime())) {
    throw new Error("Promotion end date is invalid.");
  }
  if (endsAt.getTime() <= startsAt.getTime()) {
    throw new Error("Promotion end date must be after the start date.");
  }
}

function normalizeCode(code: string | null | undefined): string | null {
  if (!code) return null;
  const trimmed = code.trim().toUpperCase();
  return trimmed.length > 0 ? trimmed : null;
}

export async function createPromotion(input: CreatePromotionInput) {
  await requireRole({
    businessId: input.businessId,
    userId: input.actorUserId,
    allowedRoles: MANAGER_ROLES
  });

  if (!input.title.trim()) {
    throw new Error("Promotion title is required.");
  }
  assertDateWindow(input.startsAt, input.endsAt);

  const code = normalizeCode(input.code);
  const targetTierIds = input.targetTierIds ?? [];

  return withBusinessScope(input.businessId, async (tx) => {
    const promotion = await tx.promotion.create({
      data: {
        businessId: input.businessId,
        title: input.title.trim(),
        description: input.description?.trim() || null,
        type: input.type,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        imageUrl: input.imageUrl?.trim() || null,
        code,
        targetTierIds
      }
    });

    await recordStaffAuditLog(
      {
        businessId: input.businessId,
        actorUserId: input.actorUserId,
        action: "promotion.create",
        targetType: "Promotion",
        targetId: promotion.id,
        metadata: {
          title: promotion.title,
          type: promotion.type,
          startsAt: promotion.startsAt.toISOString(),
          endsAt: promotion.endsAt.toISOString(),
          code: promotion.code,
          targetTierIds: promotion.targetTierIds
        }
      },
      tx
    );

    return promotion;
  });
}

export type UpdatePromotionInput = {
  promotionId: string;
  businessId: string;
  actorUserId: string;
  title?: string;
  description?: string | null;
  type?: PromotionType;
  startsAt?: Date;
  endsAt?: Date;
  imageUrl?: string | null;
  code?: string | null;
  targetTierIds?: string[];
  isActive?: boolean;
};

export async function updatePromotion(input: UpdatePromotionInput) {
  const existing = await withBusinessScope(input.businessId, (tx) =>
    tx.promotion.findUniqueOrThrow({
      where: { id: input.promotionId, businessId: input.businessId },
      select: {
        id: true,
        businessId: true,
        startsAt: true,
        endsAt: true
      }
    })
  );

  await requireRole({
    businessId: existing.businessId,
    userId: input.actorUserId,
    allowedRoles: MANAGER_ROLES
  });

  const nextStartsAt = input.startsAt ?? existing.startsAt;
  const nextEndsAt = input.endsAt ?? existing.endsAt;
  if (input.startsAt || input.endsAt) {
    assertDateWindow(nextStartsAt, nextEndsAt);
  }

  const data: Prisma.PromotionUpdateInput = {};
  if (input.title !== undefined) {
    if (!input.title.trim()) {
      throw new Error("Promotion title is required.");
    }
    data.title = input.title.trim();
  }
  if (input.description !== undefined) {
    data.description = input.description?.trim() || null;
  }
  if (input.type !== undefined) {
    data.type = input.type;
  }
  if (input.startsAt !== undefined) {
    data.startsAt = input.startsAt;
  }
  if (input.endsAt !== undefined) {
    data.endsAt = input.endsAt;
  }
  if (input.imageUrl !== undefined) {
    data.imageUrl = input.imageUrl?.trim() || null;
  }
  if (input.code !== undefined) {
    data.code = normalizeCode(input.code);
  }
  if (input.targetTierIds !== undefined) {
    data.targetTierIds = { set: input.targetTierIds };
  }
  if (input.isActive !== undefined) {
    data.isActive = input.isActive;
  }

  return withBusinessScope(existing.businessId, async (tx) => {
    const promotion = await tx.promotion.update({
      where: { id: existing.id },
      data
    });

    await recordStaffAuditLog(
      {
        businessId: existing.businessId,
        actorUserId: input.actorUserId,
        action: "promotion.update",
        targetType: "Promotion",
        targetId: promotion.id,
        metadata: {
          changed: Object.keys(data)
        }
      },
      tx
    );

    return promotion;
  });
}

export type DeletePromotionInput = {
  promotionId: string;
  businessId: string;
  actorUserId: string;
};

export async function deletePromotion(input: DeletePromotionInput) {
  const existing = await withBusinessScope(input.businessId, (tx) =>
    tx.promotion.findUniqueOrThrow({
      where: { id: input.promotionId, businessId: input.businessId },
      select: { id: true, businessId: true }
    })
  );

  await requireRole({
    businessId: existing.businessId,
    userId: input.actorUserId,
    allowedRoles: MANAGER_ROLES
  });

  return withBusinessScope(existing.businessId, async (tx) => {
    const promotion = await tx.promotion.update({
      where: { id: existing.id },
      data: { isActive: false }
    });

    await recordStaffAuditLog(
      {
        businessId: existing.businessId,
        actorUserId: input.actorUserId,
        action: "promotion.delete",
        targetType: "Promotion",
        targetId: promotion.id,
        metadata: {
          title: promotion.title
        }
      },
      tx
    );

    return promotion;
  });
}

export type BroadcastPromotionInput = {
  promotionId: string;
  businessId: string;
  actorUserId: string;
};

export type BroadcastPromotionResult = {
  promotionId: string;
  recipientCount: number;
  failedCount: number;
  broadcastAt: Date;
};

function assertPromotionBroadcastable(promotion: {
  isActive: boolean;
  startsAt: Date;
  endsAt: Date;
  broadcastAt: Date | null;
}) {
  if (!promotion.isActive) {
    throw new Error("Archived promotions cannot be broadcast.");
  }

  const now = Date.now();
  if (promotion.startsAt.getTime() > now) {
    throw new Error("This promotion has not started yet.");
  }

  if (promotion.endsAt.getTime() <= now) {
    throw new Error("This promotion has already ended.");
  }

  if (promotion.broadcastAt) {
    throw new Error("This promotion has already been broadcast.");
  }
}

export async function broadcastPromotion(
  input: BroadcastPromotionInput
): Promise<BroadcastPromotionResult> {
  const promotion = await withBusinessScope(input.businessId, (tx) =>
    tx.promotion.findUniqueOrThrow({
      where: { id: input.promotionId, businessId: input.businessId },
      include: {
        business: { select: { id: true, slug: true, name: true, wabaPhoneId: true } }
      }
    })
  );

  await requireRole({
    businessId: promotion.businessId,
    userId: input.actorUserId,
    allowedRoles: MANAGER_ROLES
  });

  assertPromotionBroadcastable(promotion);

  // Reach-pack enforcement (feature-flagged, default off): block a proactive
  // broadcast once the effective WhatsApp allowance (plan quota + active
  // reach-packs) is used up, so merchants buy a pack instead of silently
  // overspending. Coarse gate — refuses when already at/over the limit; precise
  // per-recipient accounting is a follow-up. Off by default → no behaviour change.
  if (await isFeatureEnabled("reachPackEnforcement", { businessId: promotion.businessId })) {
    try {
      await assertOutboundMessageQuota({
        businessId: promotion.businessId,
        channel: MessageChannel.WHATSAPP,
        count: 1
      });
    } catch (error) {
      if (error instanceof MessageQuotaExceededError) {
        throw new Error(
          "Your WhatsApp message allowance for this month is used up. Buy a reach-pack to keep broadcasting."
        );
      }
      throw error;
    }
  }

  // Atomically claim the broadcast slot — prevents two concurrent callers from
  // both passing assertPromotionBroadcastable and double-sending.
  const broadcastAt = new Date();
  const claimed = await withBusinessScope(promotion.businessId, (tx) =>
    tx.promotion.updateMany({
      where: { id: promotion.id, broadcastAt: null },
      data: { broadcastAt }
    })
  );
  if (claimed.count === 0) {
    throw new Error("This promotion has already been broadcast.");
  }

  // Paginate memberships in batches to avoid loading all into memory.
  // Only send to members who have an active marketing consent for this business.
  const MEMBERSHIP_BATCH = 2_000;
  // WhatsApp template {{3}} must be non-empty, so fall back to the title.
  const whatsappDetails = promotion.description?.trim() || promotion.title;
  let cursor: string | undefined;
  let totalSent = 0;
  let totalFailed = 0;
  let totalWhatsappFailed = 0;

  do {
    const batch = await withBusinessScope(promotion.businessId, (tx) => tx.membership.findMany({
      where: {
        businessId: promotion.businessId,
        isActive: true,
        ...(promotion.targetTierIds.length > 0
          ? { tierId: { in: promotion.targetTierIds } }
          : {}),
        user: {
          consents: {
            some: {
              type: ConsentType.WHATSAPP_MARKETING,
              businessId: promotion.businessId,
              revokedAt: null
            }
          }
        }
      },
      select: {
        id: true,
        userId: true,
        user: {
          select: { phone: true, phoneVerifiedAt: true, notificationPreferences: true }
        }
      },
      take: MEMBERSHIP_BATCH,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {})
    }));

    if (batch.length === 0) break;

    // Every batch member already has WHATSAPP_MARKETING consent (where-filter
    // above). A WhatsApp template is additionally sent when the member has the
    // whatsapp channel opt-in, a verified phone, and the business has a WABA.
    const whatsappSends = batch.flatMap((membership) => {
      const user = membership.user;
      const eligible =
        Boolean(promotion.business.wabaPhoneId) &&
        Boolean(user?.phone) &&
        Boolean(user?.phoneVerifiedAt) &&
        shouldDeliverNotificationChannel({
          preferences: user?.notificationPreferences,
          businessId: promotion.businessId,
          channel: "whatsapp",
          now: broadcastAt
        });

      if (!eligible || !user?.phone || !promotion.business.wabaPhoneId) {
        return [];
      }

      return [
        sendPromotionWhatsApp({
          businessId: promotion.businessId,
          wabaPhoneId: promotion.business.wabaPhoneId,
          userId: membership.userId,
          toPhone: user.phone,
          businessName: promotion.business.name,
          promotionTitle: promotion.title,
          details: whatsappDetails
        })
      ];
    });

    const [results, whatsappResults] = await Promise.all([
      Promise.allSettled(
        batch.map((membership) =>
          sendNotification({
            userId: membership.userId,
            businessId: promotion.businessId,
            title: promotion.title,
            body: promotion.description ?? "",
            type: "PROMOTION",
            actionUrl: `/b/${promotion.business.slug}`
          })
        )
      ),
      Promise.allSettled(whatsappSends)
    ]);

    const batchFailed = results.filter((r) => r.status === "rejected").length;
    totalSent += batch.length - batchFailed;
    totalFailed += batchFailed;
    totalWhatsappFailed += whatsappResults.filter(
      (r) => r.status === "rejected"
    ).length;
    cursor = batch[batch.length - 1]?.id;
  } while (true);

  const failedCount = totalFailed;
  const memberships = { length: totalSent + totalFailed };

  if (failedCount > 0 || totalWhatsappFailed > 0) {
    logger.warn(
      {
        promotionId: promotion.id,
        businessId: promotion.businessId,
        failedCount,
        whatsappFailedCount: totalWhatsappFailed,
        total: memberships.length
      },
      "promotion.broadcast.partial_failure"
    );
  }

  await withBusinessScope(promotion.businessId, async (tx) => {
    await tx.promotion.update({
      where: { id: promotion.id },
      data: { broadcastSentBy: input.actorUserId }
    });

    await recordStaffAuditLog(
      {
        businessId: promotion.businessId,
        actorUserId: input.actorUserId,
        action: "promotion.broadcast",
        targetType: "Promotion",
        targetId: promotion.id,
        metadata: {
          recipientCount: memberships.length,
          tierIds: promotion.targetTierIds,
          failed: failedCount
        }
      },
      tx
    );
  });

  return {
    promotionId: promotion.id,
    recipientCount: memberships.length,
    failedCount,
    broadcastAt
  };
}

export type RedeemPromotionCodeInput = {
  businessId: string;
  userId: string;
  code: string;
};

export async function redeemPromotionCode(input: RedeemPromotionCodeInput) {
  const code = normalizeCode(input.code);
  if (!code) {
    throw new Error("Enter a promotion code to redeem.");
  }

  const now = new Date();
  const promotion = await withBusinessScope(input.businessId, (tx) =>
    tx.promotion.findFirst({
      where: {
        businessId: input.businessId,
        code,
        isActive: true,
        startsAt: { lte: now },
        endsAt: { gt: now }
      }
    })
  );

  if (!promotion) {
    throw new Error("This promotion code is not currently active.");
  }

  try {
    await withBusinessScope(input.businessId, (tx) =>
      tx.promotionRedemption.create({
        data: {
          promotionId: promotion.id,
          userId: input.userId,
          businessId: input.businessId
        }
      })
    );
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      throw new Error("You have already redeemed this promotion code.");
    }
    throw err;
  }

  return promotion;
}
