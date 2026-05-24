import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { streamRagAnswer } from "@/lib/ai/rag";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/security";

const ChatRequestSchema = z.object({
  businessSlug: z.string().min(1).max(80),
  sessionId: z.string().min(1).optional(),
  message: z.string().min(1).max(4000)
});

function buildSessionTitle(message: string) {
  return message.trim().slice(0, 80);
}

export async function POST(request: Request) {
  const session = await auth();
  const userId = session?.user?.id ?? null;
  const ip = getClientIp(request.headers);
  const limit = await enforceRateLimit({
    identifier: `ai-chat:${userId ?? ip}`,
    windowSeconds: 60,
    max: 30
  });
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Slow down." },
      { status: 429, headers: rateLimitHeaders(limit) }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = ChatRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const business = await prisma.business.findFirst({
    where: {
      slug: parsed.data.businessSlug,
      deletedAt: null
    },
    include: { aiWorkspace: true }
  });

  if (!business || !business.isActive || !business.aiWorkspace) {
    return NextResponse.json({ error: "Business not found" }, { status: 404 });
  }

  const aiSession =
    parsed.data.sessionId
      ? await prisma.aiChatSession.findFirst({
          where: {
            id: parsed.data.sessionId,
            businessId: business.id,
            ...(userId ? { userId } : {})
          }
        })
      : null;

  const activeSession =
    aiSession ??
    (await prisma.aiChatSession.create({
      data: {
        businessId: business.id,
        workspaceId: business.aiWorkspace.id,
        userId,
        title: buildSessionTitle(parsed.data.message)
      }
    }));

  await prisma.aiChatMessage.create({
    data: {
      sessionId: activeSession.id,
      role: "user",
      content: parsed.data.message
    }
  });

  const history = await prisma.aiChatMessage.findMany({
    where: {
      sessionId: activeSession.id
    },
    orderBy: { createdAt: "asc" },
    take: 20
  });

  const encoder = new TextEncoder();
  const startedAt = Date.now();

  const stream = new ReadableStream({
    async start(controller) {
      let assistantContent = "";

      try {
        const result = await streamRagAnswer({
          businessId: business.id,
          messages: history.map((message) => ({
            role:
              message.role === "assistant" || message.role === "system"
                ? message.role
                : "user",
            content: message.content
          }))
        });

        controller.enqueue(
          encoder.encode(
            `event: session\ndata: ${JSON.stringify({
              sessionId: activeSession.id,
              title: activeSession.title
            })}\n\n`
          )
        );
        controller.enqueue(
          encoder.encode(
            `event: citations\ndata: ${JSON.stringify({
              citations: result.citations
            })}\n\n`
          )
        );

        for await (const chunk of result.stream) {
          assistantContent += chunk;
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ chunk })}\n\n`));
        }

        await prisma.aiChatMessage.create({
          data: {
            sessionId: activeSession.id,
            role: "assistant",
            content: assistantContent.trim(),
            model: result.runtime,
            latencyMs: Date.now() - startedAt,
            metadata: {
              citations: result.citations
            }
          }
        });

        controller.enqueue(encoder.encode("event: done\ndata: complete\n\n"));
        controller.close();
      } catch (error) {
        logger.error(
          {
            err: error,
            businessId: business.id,
            sessionId: activeSession.id
          },
          "ai.chat.stream_failed"
        );

        if (assistantContent) {
          await prisma.aiChatMessage.create({
            data: {
              sessionId: activeSession.id,
              role: "assistant",
              content: assistantContent,
              model: "partial",
              latencyMs: Date.now() - startedAt
            }
          });
        }

        controller.enqueue(
          encoder.encode(
            `event: error\ndata: ${JSON.stringify({
              message: "Sorry, the AI co-worker is unavailable right now."
            })}\n\n`
          )
        );
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive"
    }
  });
}
