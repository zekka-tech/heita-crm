import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { MessageChannel } from "@prisma/client";

import { auth } from "@/lib/auth";
import { getPlanQuota } from "@/lib/billing";
import { csrfFailureResponse } from "@/lib/csrf";
import { logger } from "@/lib/logger";
import { prisma, withBusinessScope } from "@/lib/prisma";
import { enforceRateLimit } from "@/lib/rate-limit";
import { publishEvent } from "@/lib/redis-pubsub";
import {
  getConversationMessages,
  getOrCreateConversation
} from "@/server/services/connect/conversation.service";

export const dynamic = "force-dynamic";

const RATE_LIMIT_MAX_PER_MINUTE = 30;
const RATE_LIMIT_WINDOW_SECONDS = 60;

export async function GET(request: NextRequest): Promise<Response> {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const conversationId = searchParams.get("conversationId");
  const businessId = searchParams.get("businessId");
  const cursor = searchParams.get("cursor");

  if (!conversationId || !businessId) {
    return NextResponse.json(
      { error: "conversationId and businessId are required." },
      { status: 400 }
    );
  }

  try {
    const participant = await withBusinessScope(businessId, (tx) =>
      tx.conversationParticipant.findFirst({
        where: { conversationId, userId },
        select: { id: true }
      })
    );

    if (!participant) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const result = await getConversationMessages({
      conversationId,
      businessId,
      cursor: cursor ?? undefined,
      limit: 50
    });

    return NextResponse.json(result);
  } catch (err) {
    logger.error({ err }, "connect.messages.get.error");
    return NextResponse.json({ error: "Failed to fetch messages." }, { status: 500 });
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  const csrfFailure = await csrfFailureResponse(request);
  if (csrfFailure) return csrfFailure;

  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = await enforceRateLimit({
    identifier: `connect:send:${userId}`,
    windowSeconds: RATE_LIMIT_WINDOW_SECONDS,
    max: RATE_LIMIT_MAX_PER_MINUTE
  });

  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many messages. Please wait." },
      {
        status: 429,
        headers: {
          "X-RateLimit-Remaining": String(rl.remaining),
          "X-RateLimit-Reset": String(rl.resetInSeconds)
        }
      }
    );
  }

  let body: {
    conversationId?: string;
    recipientId?: string;
    businessId?: string;
    content?: string;
    channel?: string;
    attachments?: { mediaType: string; mimeType?: string; fileName?: string; byteSize?: number; storageKey?: string; sourceUrl?: string }[];
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { conversationId, recipientId, businessId, content, channel, attachments } = body;

  if (!content || !content.trim()) {
    return NextResponse.json({ error: "Content is required." }, { status: 400 });
  }

  const MAX_CONTENT_CHARS = 4_000;
  if (content.trim().length > MAX_CONTENT_CHARS) {
    return NextResponse.json(
      { error: `Message too long (max ${MAX_CONTENT_CHARS} characters).` },
      { status: 400 }
    );
  }

  if (!businessId) {
    return NextResponse.json({ error: "businessId is required." }, { status: 400 });
  }

  const business = await prisma.business.findFirst({
    where: { id: businessId, deletedAt: null },
    select: { id: true, planId: true }
  });

  if (!business) {
    return NextResponse.json({ error: "Business not found." }, { status: 404 });
  }

  const planQuota = getPlanQuota(business.planId);
  if (planQuota.maxInAppMessagesPerMonth) {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const count = await withBusinessScope(businessId, (tx) =>
      tx.message.count({
        where: {
          businessId,
          channel: "IN_APP",
          createdAt: { gte: monthStart }
        }
      })
    );

    if (count >= planQuota.maxInAppMessagesPerMonth) {
      return NextResponse.json(
        { error: "Monthly in-app message limit reached. Please upgrade your plan." },
        { status: 429 }
      );
    }
  }

  // When an existing conversation is supplied, verify the caller is a participant
  // (the GET handler enforces this; the POST must too to prevent IDOR).
  if (conversationId) {
    const participant = await withBusinessScope(businessId, (tx) =>
      tx.conversationParticipant.findFirst({
        where: { conversationId, userId },
        select: { id: true }
      })
    );
    if (!participant) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  try {
    const message = await withBusinessScope(businessId, async (tx) => {
      let convId = conversationId;

      if (!convId) {
        if (!recipientId) {
          throw new Error("recipientId is required when conversationId is not provided.");
        }

        const conversation = await getOrCreateConversation({
          businessId,
          customerId: recipientId,
          channel: channel as "IN_APP" | "WHATSAPP" | "SMS" | "EMAIL" | "PUSH"
        });
        convId = conversation.id;
      }

      const messageData = {
        businessId,
        userId,
        conversationId: convId,
        channel: MessageChannel.IN_APP,
        direction: "OUTBOUND" as const,
        body: content.trim(),
        status: "SENT" as const,
        sentAt: new Date(),
        attachments: attachments?.length
          ? {
              create: attachments.map((att) => ({
                mediaType: att.mediaType,
                mimeType: att.mimeType ?? null,
                fileName: att.fileName ?? null,
                byteSize: att.byteSize ?? null,
                storageKey: att.storageKey ?? null,
                sourceUrl: att.sourceUrl ?? null
              }))
            }
          : undefined
      };

      const created = await tx.message.create({
        data: messageData,
        include: {
          attachments: true,
          user: {
            select: { id: true, name: true, image: true }
          }
        }
      });

      await tx.conversation.update({
        where: { id: convId },
        data: { lastMessageAt: new Date() }
      });

      const messageBase = created as typeof created & { attachments?: { mediaType: string; sourceUrl: string | null }[] };
      return messageBase;
    });

    const recipients = await withBusinessScope(businessId, (tx) =>
      tx.conversationParticipant.findMany({
        where: { conversationId: message.conversationId! },
        select: { userId: true }
      })
    );

    for (const recipient of recipients) {
      await publishEvent(`user:${recipient.userId}:events`, {
        type: "message.new",
        message: {
          id: message.id,
          conversationId: message.conversationId,
          body: message.body,
          direction: message.direction,
          status: message.status,
          sentAt: message.sentAt,
          senderId: userId,
          attachments: message.attachments
        }
      });
    }

    return NextResponse.json({ message }, { status: 201 });
  } catch (err) {
    logger.error({ err }, "connect.messages.send.error");
    const errorMessage = err instanceof Error ? err.message : "Failed to send message.";
    const status = errorMessage.includes("required") ? 400 : 500;
    return NextResponse.json({ error: errorMessage }, { status });
  }
}
