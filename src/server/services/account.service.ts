import { ConsentChannel, ConsentType } from "@prisma/client";

import { sendEmail } from "@/lib/email";
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
        orderBy: { joinedAt: "asc" }
      }),
      prisma.loyaltyTransaction.findMany({
        where: {
          OR: [
            { userId },
            {
              membership: {
                userId
              }
            }
          ]
        },
        orderBy: { createdAt: "asc" }
      }),
      prisma.aiChatMessage.findMany({
        where: {
          session: {
            userId
          }
        },
        include: {
          session: true
        },
        orderBy: { createdAt: "asc" }
      }),
      prisma.message.findMany({
        where: { userId },
        orderBy: { createdAt: "asc" }
      }),
      prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: "asc" }
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
}) {
  return prisma.user.update({
    where: { id: input.userId },
    data: {
      name: input.name ?? undefined,
      email: input.email ?? undefined,
      preferredAiMode: input.preferredAiMode ?? undefined
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
        preferredAiMode: null
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
