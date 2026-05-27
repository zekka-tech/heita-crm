import { ConsentChannel, ConsentType, Prisma } from "@prisma/client";

import { sendEmail } from "@/lib/email";
import {
  normalizeNotificationPreferences,
  type NotificationPreferences
} from "@/lib/notification-preferences";
import { prisma } from "@/lib/prisma";

export async function recordConsent(input: {
  userId: string;
  type: ConsentType;
  channel?: ConsentChannel;
  source: string;
  businessId?: string | null;
}) {
  return prisma.userConsent.create({
    data: {
      userId: input.userId,
      businessId: input.businessId ?? null,
      type: input.type,
      channel: input.channel ?? ConsentChannel.WEB,
      source: input.source
    }
  });
}

// Max rows per collection to prevent OOM on accounts with large history.
// Exports are capped at 10 000 rows per type; users needing full exports
// should contact support for a managed CSV dump.
const EXPORT_ROW_CAP = 10_000;

export async function exportAccountData(userId: string) {
  const [user, memberships, loyaltyTransactions, aiChatMessages, messages, notifications, consents] =
    await Promise.all([
      prisma.user.findUniqueOrThrow({
        where: { id: userId },
        include: {
          accounts: true,
          pushSubscriptions: true
        }
      }),
      prisma.membership.findMany({
        where: { userId },
        include: {
          business: true,
          tier: true
        },
        orderBy: { joinedAt: "asc" },
        take: EXPORT_ROW_CAP
      }),
      prisma.loyaltyTransaction.findMany({
        where: {
          OR: [
            { userId },
            { membership: { userId } }
          ]
        },
        orderBy: { createdAt: "asc" },
        take: EXPORT_ROW_CAP
      }),
      prisma.aiChatMessage.findMany({
        where: { session: { userId } },
        include: { session: true },
        orderBy: { createdAt: "asc" },
        take: EXPORT_ROW_CAP
      }),
      prisma.message.findMany({
        where: { userId },
        orderBy: { createdAt: "asc" },
        take: EXPORT_ROW_CAP
      }),
      prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: "asc" },
        take: EXPORT_ROW_CAP
      }),
      prisma.userConsent.findMany({
        where: { userId },
        include: { business: true },
        orderBy: { grantedAt: "asc" }
      })
    ]);

  return {
    exportedAt: new Date().toISOString(),
    user,
    memberships,
    loyaltyTransactions,
    aiChatMessages,
    messages,
    notifications,
    consents
  };
}

export async function updateAccountProfile(input: {
  userId: string;
  name?: string | null;
  email?: string | null;
  preferredAiMode?: string | null;
  notificationPreferences?: NotificationPreferences | null;
}) {
  const normalizedPreferences =
    input.notificationPreferences !== undefined
      ? normalizeNotificationPreferences(input.notificationPreferences)
      : undefined;

  return prisma.user.update({
    where: { id: input.userId },
    data: {
      name: input.name ?? undefined,
      email: input.email ?? undefined,
      preferredAiMode: input.preferredAiMode ?? undefined,
      notificationPreferences:
        normalizedPreferences !== undefined
          ? (normalizedPreferences as Prisma.InputJsonValue)
          : undefined
    }
  });
}

export async function softDeleteAccount(userId: string) {
  const deletedAt = new Date();
  const existingUser = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      email: true
    }
  });

  const user = await prisma.$transaction(async (tx) => {
    const updatedUser = await tx.user.update({
      where: { id: userId },
      data: {
        deletedAt,
        email: null,
        phone: null,
        image: null,
        preferredAiMode: null,
        notificationPreferences: Prisma.JsonNull
      }
    });

    await tx.membership.updateMany({
      where: { userId, isActive: true },
      data: { isActive: false }
    });

    await tx.userConsent.updateMany({
      where: {
        userId,
        revokedAt: null
      },
      data: {
        revokedAt: deletedAt
      }
    });

    return updatedUser;
  });

  if (existingUser.email) {
    await sendEmail({
      to: existingUser.email,
      subject: "Your Heita account deletion has been scheduled",
      text: "Your Heita account has been marked for deletion and your active memberships were cancelled.",
      html:
        "<p>Your Heita account has been marked for deletion and your active memberships were cancelled.</p>"
    }).catch(() => undefined);
  }

  return user;
}
