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
  customerServiceWindowOpen: boolean;
  customerServiceWindowExpiresAt: Date | null;
};

const WHATSAPP_CUSTOMER_SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;

function computeCustomerServiceWindow(lastInboundAt: Date | null) {
  if (!lastInboundAt) {
    return {
      open: false,
      expiresAt: null
    };
  }

  const expiresAt = new Date(lastInboundAt.getTime() + WHATSAPP_CUSTOMER_SERVICE_WINDOW_MS);

  return {
    open: expiresAt.getTime() > Date.now(),
    expiresAt
  };
}

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
      const lastInboundAt =
        message.direction === "INBOUND" ? message.createdAt : null;
      const serviceWindow = computeCustomerServiceWindow(lastInboundAt);

      conversations.set(contactPhone, {
        userId: message.userId,
        contactPhone,
        name: message.user?.name ?? null,
        lastMessageAt: message.createdAt,
        lastMessageBody: message.body,
        lastDirection: message.direction,
        unreadCount: message.direction === "INBOUND" ? 1 : 0,
        status: message.status,
        customerServiceWindowOpen: serviceWindow.open,
        customerServiceWindowExpiresAt: serviceWindow.expiresAt
      });
      continue;
    }

    if (message.direction === "INBOUND") {
      existing.unreadCount += 1;
      if (!existing.customerServiceWindowOpen) {
        const serviceWindow = computeCustomerServiceWindow(message.createdAt);
        existing.customerServiceWindowOpen = serviceWindow.open;
        existing.customerServiceWindowExpiresAt = serviceWindow.expiresAt;
      }
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

export async function getWhatsappCustomerServiceWindowStatus(input: {
  businessId: string;
  contactPhone: string;
}) {
  const lastInboundMessage = await prisma.message.findFirst({
    where: {
      businessId: input.businessId,
      channel: MessageChannel.WHATSAPP,
      contactPhone: input.contactPhone,
      direction: "INBOUND"
    },
    orderBy: {
      createdAt: "desc"
    },
    select: {
      createdAt: true
    }
  });

  return computeCustomerServiceWindow(lastInboundMessage?.createdAt ?? null);
}
