import { ConversationStatus, MessageChannel, type Prisma } from "@prisma/client";

import { prisma, withBusinessScope, withUserScope } from "@/lib/prisma";

type ConversationResult = {
  id: string;
  businessId: string;
  customerId: string;
  subject: string | null;
  channel: MessageChannel;
  status: string;
  lastMessageAt: Date | null;
  createdAt: Date;
  participants: {
    userId: string;
    name: string | null;
    role: string;
    isTyping: boolean;
    lastReadAt: Date | null;
  }[];
  lastMessage: {
    id: string;
    body: string;
    direction: string;
    status: string | null;
    createdAt: Date;
  } | null;
  unreadCount: number;
};

const CONVERSATION_INCLUDES = {
  participants: {
    include: {
      user: {
        select: { id: true, name: true }
      }
    }
  },
  messages: {
    orderBy: { createdAt: "desc" } as const,
    take: 1,
    select: {
      id: true,
      body: true,
      direction: true,
      status: true,
      createdAt: true
    }
  }
};

function formatConversation(conv: Record<string, unknown>): ConversationResult {
  const c = conv as {
    id: string;
    businessId: string;
    customerId: string;
    subject: string | null;
    channel: MessageChannel;
    status: string;
    lastMessageAt: Date | null;
    createdAt: Date;
    participants: {
      user: { id: string; name: string | null };
      userId: string;
      role: string;
      isTyping: boolean;
      lastReadAt: Date | null;
    }[];
    messages: {
      id: string;
      body: string;
      direction: string;
      status: string | null;
      createdAt: Date;
    }[];
    _count?: { messages: number };
    unreadCount?: number;
  };

  return {
    id: c.id,
    businessId: c.businessId,
    customerId: c.customerId,
    subject: c.subject,
    channel: c.channel,
    status: c.status,
    lastMessageAt: c.lastMessageAt,
    createdAt: c.createdAt,
    participants: c.participants.map((p) => ({
      userId: p.userId,
      name: p.user.name,
      role: p.role,
      isTyping: p.isTyping,
      lastReadAt: p.lastReadAt
    })),
    lastMessage: c.messages[0] ?? null,
    unreadCount: (c as { unreadCount?: number }).unreadCount ?? 0
  };
}

export async function getOrCreateConversation(input: {
  businessId: string;
  customerId: string;
  subject?: string;
  channel?: MessageChannel;
}): Promise<ConversationResult> {
  return withBusinessScope(input.businessId, async (tx) => {
    const existing = await tx.conversation.findFirst({
      where: {
        businessId: input.businessId,
        customerId: input.customerId,
        status: "ACTIVE"
      },
      include: {
        participants: {
          include: {
            user: {
              select: { id: true, name: true }
            }
          }
        },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            id: true,
            body: true,
            direction: true,
            status: true,
            createdAt: true
          }
        }
      }
    });

    if (existing) {
      return formatConversation(existing as unknown as Record<string, unknown>);
    }

    const conversation = await tx.conversation.create({
      data: {
        businessId: input.businessId,
        customerId: input.customerId,
        subject: input.subject ?? null,
        channel: input.channel ?? MessageChannel.IN_APP,
        participants: {
          create: {
            userId: input.customerId,
            role: "OWNER"
          }
        }
      },
      include: CONVERSATION_INCLUDES
    });

    return formatConversation(conversation as unknown as Record<string, unknown>);
  });
}

export async function getConversationsForUser(input: {
  userId: string;
  businessId?: string;
  status?: string;
  cursor?: string;
  limit?: number;
}): Promise<{ conversations: ConversationResult[]; nextCursor: string | null }> {
  const limit = input.limit ?? 20;
  const where: Prisma.ConversationWhereInput = {
    participants: {
      some: { userId: input.userId }
    }
  };

  if (input.businessId) {
    where.businessId = input.businessId;
  }

  if (input.status) {
    where.status = input.status as ConversationStatus;
  }

  const run = async (tx: Pick<typeof prisma, 'conversation'>) => {
    const conversations = await tx.conversation.findMany({
      where,
      include: CONVERSATION_INCLUDES,
      orderBy: { lastMessageAt: "desc" },
      take: limit + 1,
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {})
    });

    const hasMore = conversations.length > limit;
    const results = hasMore ? conversations.slice(0, limit) : conversations;
    const nextCursor = hasMore ? results[results.length - 1]?.id ?? null : null;

    return {
      conversations: results.map((c) =>
        formatConversation(c as unknown as Record<string, unknown>)
      ),
      nextCursor
    };
  };

  if (input.businessId) {
    return withBusinessScope(input.businessId, (tx) => run(tx));
  }

  return withUserScope(input.userId, (tx) => run(tx));
}

export async function getConversationMessages(input: {
  conversationId: string;
  businessId: string;
  cursor?: string;
  limit?: number;
}) {
  const limit = input.limit ?? 50;

  return withBusinessScope(input.businessId, async (tx) => {
    const messages = await tx.message.findMany({
      where: {
        conversationId: input.conversationId,
        businessId: input.businessId
      },
      include: {
        attachments: {
          orderBy: { createdAt: "asc" }
        },
        user: {
          select: { id: true, name: true, image: true }
        }
      },
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {})
    });

    const hasMore = messages.length > limit;
    const results = hasMore ? messages.slice(0, limit) : messages;
    const nextCursor = hasMore ? results[results.length - 1]?.id ?? null : null;

    return {
      messages: results.reverse(),
      nextCursor
    };
  });
}

export async function markAsRead(input: {
  conversationId: string;
  businessId: string;
  userId: string;
}) {
  return withBusinessScope(input.businessId, async (tx) => {
    await tx.conversationParticipant.updateMany({
      where: {
        conversationId: input.conversationId,
        userId: input.userId
      },
      data: { lastReadAt: new Date() }
    });

    await tx.message.updateMany({
      where: {
        conversationId: input.conversationId,
        businessId: input.businessId,
        readAt: null,
        direction: "INBOUND"
      },
      data: { readAt: new Date() }
    });
  });
}

export async function addParticipant(input: {
  businessId: string;
  conversationId: string;
  userId: string;
  role?: "OWNER" | "AGENT" | "MEMBER";
}) {
  return withBusinessScope(input.businessId, async (tx) => {
    return tx.conversationParticipant.create({
      data: {
        conversationId: input.conversationId,
        userId: input.userId,
        role: input.role ?? "MEMBER"
      }
    });
  });
}

export async function updateTypingStatus(input: {
  conversationId: string;
  userId: string;
  isTyping: boolean;
}) {
  return withUserScope(input.userId, (tx) =>
    tx.conversationParticipant.updateMany({
      where: {
        conversationId: input.conversationId,
        userId: input.userId
      },
      data: { isTyping: input.isTyping }
    })
  );
}

export async function updateConversationStatus(input: {
  businessId: string;
  conversationId: string;
  status: "ACTIVE" | "ARCHIVED" | "BLOCKED";
}) {
  return withBusinessScope(input.businessId, async (tx) => {
    return tx.conversation.update({
      where: { id: input.conversationId, businessId: input.businessId },
      data: { status: input.status }
    });
  });
}
