import { MessageChannel } from "@prisma/client";

import { prisma } from "@/lib/prisma";

type ConversationParticipant = {
  userId: string | null;
  contactPhone: string;
  name: string | null;
  lastMessageAt: Date;
  lastMessageBody: string;
  lastDirection: string;
  unreadCount: number;
  status: string | null;
};

export async function listBusinessConversations(input: { businessId: string }) {
  const messages = await prisma.message.findMany({
    where: {
      businessId: input.businessId,
      channel: MessageChannel.WHATSAPP,
      contactPhone: {
        not: null
      }
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          phone: true
        }
      }
    },
    orderBy: {
      createdAt: "desc"
    },
    take: 300
  });

  const conversations = new Map<string, ConversationParticipant>();

  for (const message of messages) {
    const contactPhone = message.contactPhone;
    if (!contactPhone) {
      continue;
    }

    const existing = conversations.get(contactPhone);
    if (!existing) {
      conversations.set(contactPhone, {
        userId: message.userId,
        contactPhone,
        name: message.user?.name ?? null,
        lastMessageAt: message.createdAt,
        lastMessageBody: message.body,
        lastDirection: message.direction,
        unreadCount: message.direction === "INBOUND" ? 1 : 0,
        status: message.status
      });
      continue;
    }

    if (message.direction === "INBOUND") {
      existing.unreadCount += 1;
    }
  }

  return [...conversations.values()].sort(
    (left, right) => right.lastMessageAt.getTime() - left.lastMessageAt.getTime()
  );
}

export async function getBusinessConversationThread(input: {
  businessId: string;
  contactPhone: string;
}) {
  return prisma.message.findMany({
    where: {
      businessId: input.businessId,
      channel: MessageChannel.WHATSAPP,
      contactPhone: input.contactPhone
    },
    include: {
      attachments: {
        orderBy: {
          createdAt: "asc"
        }
      },
      user: {
        select: {
          id: true,
          name: true,
          phone: true
        }
      }
    },
    orderBy: {
      createdAt: "asc"
    },
    take: 200
  });
}
