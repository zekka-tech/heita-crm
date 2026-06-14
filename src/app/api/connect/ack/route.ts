import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { csrfFailureResponse } from "@/lib/csrf";
import { logger } from "@/lib/logger";
import { prisma, withBusinessScope } from "@/lib/prisma";
import { publishEvent } from "@/lib/redis-pubsub";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<Response> {
  const csrfFailure = await csrfFailureResponse(request);
  if (csrfFailure) return csrfFailure;

  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    messageIds?: string[];
    type?: "delivered" | "read";
    businessId?: string;
    conversationId?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { messageIds, type, businessId, conversationId } = body;

  if (!type || !businessId) {
    return NextResponse.json(
      { error: "type and businessId are required." },
      { status: 400 }
    );
  }

  // Cap batch size to prevent DoS via sequential DB writes (audit finding 6).
  const MAX_MESSAGE_IDS = 100;
  if (messageIds && messageIds.length > MAX_MESSAGE_IDS) {
    return NextResponse.json(
      { error: `Cannot acknowledge more than ${MAX_MESSAGE_IDS} messages at once.` },
      { status: 400 }
    );
  }

  try {
    if (type === "delivered" && messageIds?.length) {
      // Verify the caller is a participant in the conversation owning these
      // messages before bulk-updating them (IDOR fix — audit finding 4).
      // Look up all unique conversationIds for the given messageIds, then
      // verify participant membership for each in one query.
      const msgs = await prisma.message.findMany({
        where: { id: { in: messageIds }, businessId },
        select: { id: true, conversationId: true }
      });
      const conversationIds = [...new Set(msgs.map((m) => m.conversationId).filter(Boolean) as string[])];

      if (conversationIds.length > 0) {
        const memberCount = await prisma.conversationParticipant.count({
          where: { conversationId: { in: conversationIds }, userId }
        });
        if (memberCount !== conversationIds.length) {
          return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
      }

      await withBusinessScope(businessId, async (tx) => {
        await tx.message.updateMany({
          where: {
            id: { in: messageIds },
            businessId,
            deliveredAt: null
          },
          data: { deliveredAt: new Date() }
        });
      });

      // Fan out delivered receipts — collapse participant lookups per unique conversation.
      const participantsByConversation = await prisma.conversationParticipant.findMany({
        where: { conversationId: { in: conversationIds } },
        select: { userId: true, conversationId: true }
      });
      for (const msgId of messageIds) {
        const msg = msgs.find((m) => m.id === msgId);
        if (msg?.conversationId) {
          const participants = participantsByConversation.filter(
            (p) => p.conversationId === msg.conversationId
          );
          for (const p of participants) {
            await publishEvent(`user:${p.userId}:events`, {
              type: "message.delivered",
              messageId: msgId,
              userId
            });
          }
        }
      }
    }

    if (type === "read" && conversationId) {
      // Verify participant membership before marking messages read (IDOR prevention).
      const participant = await prisma.conversationParticipant.findFirst({
        where: { conversationId, userId },
        select: { id: true }
      });
      if (!participant) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      await withBusinessScope(businessId, async (tx) => {
        await tx.message.updateMany({
          where: {
            conversationId,
            businessId,
            readAt: null,
            direction: "INBOUND"
          },
          data: { readAt: new Date() }
        });

        await tx.conversationParticipant.updateMany({
          where: {
            conversationId,
            userId
          },
          data: { lastReadAt: new Date() }
        });
      });

      const participants = await prisma.conversationParticipant.findMany({
        where: { conversationId },
        select: { userId: true }
      });
      for (const p of participants) {
        await publishEvent(`user:${p.userId}:events`, {
          type: "message.read",
          conversationId,
          userId
        });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "connect.ack.error");
    return NextResponse.json({ error: "Failed to acknowledge messages." }, { status: 500 });
  }
}
