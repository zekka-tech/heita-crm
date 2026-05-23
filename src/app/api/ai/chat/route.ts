import { NextResponse } from "next/server";
import { z } from "zod";

import { streamRagAnswer } from "@/lib/ai/rag";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/security";

const ChatRequestSchema = z.object({
  businessSlug: z.string().min(1).max(80),
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant", "system"]),
        content: z.string().min(1).max(4000)
      })
    )
    .min(1)
    .max(40)
});

export async function POST(request: Request) {
  const ip = getClientIp(request.headers);
  const limit = await enforceRateLimit({
    identifier: `ai-chat:${ip}`,
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

  const business = await prisma.business.findUnique({
    where: { slug: parsed.data.businessSlug }
  });

  if (!business || !business.isActive) {
    return NextResponse.json({ error: "Business not found" }, { status: 404 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of streamRagAnswer({
          businessId: business.id,
          messages: parsed.data.messages
        })) {
          controller.enqueue(encoder.encode(`data: ${chunk}\n\n`));
        }
        controller.enqueue(encoder.encode("event: done\ndata: complete\n\n"));
        controller.close();
      } catch (error) {
        logger.error({ err: error, businessId: business.id }, "ai.chat.stream_failed");
        controller.enqueue(
          encoder.encode("data: Sorry, the AI co-worker is unavailable right now.\n\n")
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
