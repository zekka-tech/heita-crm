import { MessageChannel } from "@prisma/client";
import { Prisma } from "@prisma/client";

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

  const phones = latestMessages.map((m) => m.contactPhone!).filter(Boolean);

  // Single query: unread count + last-inbound timestamp grouped by contactPhone.
  // "Unread" means inbound messages where staff hasn't read them yet (readByStaffAt IS NULL).
  type UnreadRow = { contact_phone: string; unread_count: bigint; last_inbound_at: Date | null };
  const unreadRows: UnreadRow[] = phones.length
    ? await prisma.$queryRaw(
        Prisma.sql`
          SELECT
            "contactPhone" AS contact_phone,
            COUNT(*) FILTER (WHERE direction = 'INBOUND' AND "readByStaffAt" IS NULL)::bigint AS unread_count,
            MAX(CASE WHEN direction = 'INBOUND' THEN "createdAt" END) AS last_inbound_at
          FROM "Message"
          WHERE
            "businessId" = ${input.businessId}
            AND channel = 'WHATSAPP'
            AND "contactPhone" = ANY(${phones})
          GROUP BY "contactPhone"
        `
      )
    : [];

  const unreadByPhone = new Map(
    unreadRows.map((r) => [
      r.contact_phone,
      { unreadCount: Number(r.unread_count), lastInboundAt: r.last_inbound_at }
    ])
  );

  const conversations: ConversationParticipant[] = latestMessages.map((message) => {
    const contactPhone = message.contactPhone!;
    const stats = unreadByPhone.get(contactPhone) ?? { unreadCount: 0, lastInboundAt: null };
    const serviceWindow = computeCustomerServiceWindow(stats.lastInboundAt);

    return {
      userId: message.userId,
      contactPhone,
      name: message.user?.name ?? null,
      lastMessageAt: message.createdAt,
      lastMessageBody: message.body,
      lastDirection: message.direction,
      unreadCount: stats.unreadCount,
      status: message.status,
      customerServiceWindowOpen: serviceWindow.open,
      customerServiceWindowExpiresAt: serviceWindow.expiresAt
    };
  });

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
