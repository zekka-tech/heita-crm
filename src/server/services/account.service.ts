import { ConsentChannel, ConsentType, Prisma } from "@prisma/client";

import { sendEmail } from "@/lib/email";
import { logger } from "@/lib/logger";
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
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          image: true,
          createdAt: true,
          updatedAt: true,
          notificationPreferences: true,
          // Expose only provider name — never access/refresh tokens
          accounts: { select: { provider: true, type: true } },
          pushSubscriptions: { select: { endpoint: true, createdAt: true } }
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

const ALLOWED_AI_MODES = ["ollama", "anthropic"] as const;

export async function updateAccountProfile(input: {
  userId: string;
  name?: string | null;
  email?: string | null;
  preferredAiMode?: string | null;
  notificationPreferences?: NotificationPreferences | null;
}) {
  if (input.name !== undefined && input.name !== null && input.name.length > 120) {
    throw new Error("Name must be 120 characters or fewer.");
  }
  if (input.email !== undefined && input.email !== null) {
    if (input.email.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) {
      throw new Error("Provide a valid email address.");
    }
  }
  if (
    input.preferredAiMode !== undefined &&
    input.preferredAiMode !== null &&
    !ALLOWED_AI_MODES.includes(input.preferredAiMode as (typeof ALLOWED_AI_MODES)[number])
  ) {
    throw new Error("Invalid AI mode.");
  }

  const normalizedPreferences =
    input.notificationPreferences !== undefined
      ? normalizeNotificationPreferences(input.notificationPreferences)
      : undefined;

  const changedFields = (
    [
      input.name !== undefined && "name",
      input.email !== undefined && "email",
      input.preferredAiMode !== undefined && "preferredAiMode",
      input.notificationPreferences !== undefined && "notificationPreferences"
    ] as const
  ).filter(Boolean);

  const result = await prisma.user.update({
    where: { id: input.userId },
    data: {
      name: input.name ?? undefined,
      email: input.email ?? undefined,
      preferredAiMode: input.preferredAiMode ?? undefined,
      notificationPreferences:
        normalizedPreferences !== undefined
          ? (normalizedPreferences as Prisma.InputJsonValue)
          : undefined
    },
    select: { id: true, name: true, email: true, image: true, updatedAt: true }
  });

  logger.info({ userId: input.userId, changedFields }, "account.profile.updated");

  return result;
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
