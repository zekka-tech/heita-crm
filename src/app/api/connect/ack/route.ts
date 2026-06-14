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

  try {
    if (type === "delivered" && messageIds?.length) {
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

      for (const msgId of messageIds) {
        const msg = await prisma.message.findUnique({
          where: { id: msgId },
          select: { conversationId: true }
        });
        if (msg?.conversationId) {
          const participants = await prisma.conversationParticipant.findMany({
            where: { conversationId: msg.conversationId },
            select: { userId: true }
          });
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
