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
  // Fetch the most recent message per unique contactPhone using distinct.
  // This avoids the earlier approach of fetching 300 messages and grouping
  // client-side, which silently dropped threads beyond the first 300 rows.
  const latestMessages = await prisma.message.findMany({
    where: {
      businessId: input.businessId,
      channel: MessageChannel.WHATSAPP,
      contactPhone: { not: null }
    },
    distinct: ["contactPhone"],
    include: {
      user: {
        select: { id: true, name: true, phone: true }
      }
    },
    orderBy: { createdAt: "desc" },
    take: 200
  });

  const conversations: ConversationParticipant[] = await Promise.all(
    latestMessages.map(async (message) => {
      const contactPhone = message.contactPhone!;

      const [unreadCount, lastInbound] = await Promise.all([
        prisma.message.count({
          where: {
            businessId: input.businessId,
            channel: MessageChannel.WHATSAPP,
            contactPhone,
            direction: "INBOUND"
          }
        }),
        prisma.message.findFirst({
          where: {
            businessId: input.businessId,
            channel: MessageChannel.WHATSAPP,
            contactPhone,
            direction: "INBOUND"
          },
          orderBy: { createdAt: "desc" },
          select: { createdAt: true }
        })
      ]);

      const serviceWindow = computeCustomerServiceWindow(lastInbound?.createdAt ?? null);

      return {
        userId: message.userId,
        contactPhone,
        name: message.user?.name ?? null,
        lastMessageAt: message.createdAt,
        lastMessageBody: message.body,
        lastDirection: message.direction,
        unreadCount,
        status: message.status,
        customerServiceWindowOpen: serviceWindow.open,
        customerServiceWindowExpiresAt: serviceWindow.expiresAt
      };
    })
  );

  return conversations.sort(
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
