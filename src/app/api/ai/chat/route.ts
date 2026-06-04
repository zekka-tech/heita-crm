import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { streamRagAnswer, type ChatTurn } from "@/lib/ai/rag";
import { csrfFailureResponse } from "@/lib/csrf";
import { logger } from "@/lib/logger";
import { enforceRateLimit } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";
import { captureEvent } from "@/lib/telemetry";
import {
  AiUsageQuotaExceededError,
  buildAiQuotaExceededResponse,
  reserveAiMessageQuota,
  finalizeAiTokenUsage,
  releaseAiTokenUsage
} from "@/server/services/ai-usage.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const RATE_LIMIT_PER_MINUTE = 20;
const RATE_LIMIT_WINDOW_SECONDS = 60;

function sseFrame(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function POST(request: NextRequest): Promise<Response> {
  const csrfFailure = await csrfFailureResponse(request);
  if (csrfFailure) return csrfFailure;

  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Rate limit: 20 requests per minute per user
  const rl = await enforceRateLimit({
    identifier: `ai:chat:${userId}`,
    windowSeconds: RATE_LIMIT_WINDOW_SECONDS,
    max: RATE_LIMIT_PER_MINUTE
  });

  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please wait before sending another message." },
      {
        status: 429,
        headers: {
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(rl.resetInSeconds)
        }
      }
    );
  }

  let body: { sessionId?: string | null; message?: string; businessSlug?: string; businessId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { sessionId, message, businessSlug, businessId: bodyBusinessId } = body;

  if (!message?.trim()) {
    return NextResponse.json({ error: "message is required." }, { status: 400 });
  }

  if (!businessSlug && !bodyBusinessId) {
    return NextResponse.json({ error: "businessSlug or businessId is required." }, { status: 400 });
  }

  // Resolve business and verify caller is staff of that business (IDOR prevention)
  let business: { id: string; name: string } | null = null;
  try {
    if (bodyBusinessId) {
      business = await prisma.business.findFirst({
        where: { id: bodyBusinessId, deletedAt: null },
        select: { id: true, name: true }
      });
    } else if (businessSlug) {
      business = await prisma.business.findFirst({
        where: { slug: businessSlug, deletedAt: null },
        select: { id: true, name: true }
      });
    }
  } catch (err) {
    logger.error({ err }, "ai.chat.business_lookup_error");
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }

  if (!business) {
    return NextResponse.json({ error: "Business not found." }, { status: 404 });
  }

  // Only staff members of this business may use its AI workspace
  const staffMember = await prisma.staffMember.findUnique({
    where: { businessId_userId: { businessId: business.id, userId } },
    select: { id: true }
  });
  if (!staffMember) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const businessId = business.id;

  // Resolve or create AI workspace + session
  let resolvedSessionId: string;
  let priorMessages: ChatTurn[] = [];

  try {
    // Ensure workspace exists (upsert)
    const workspace = await prisma.aiWorkspace.upsert({
      where: { businessId },
      create: { businessId },
      update: {}
    });

    if (sessionId) {
      // Load only the most recent MAX_HISTORY turns — the RAG pipeline discards older context
      const MAX_HISTORY = 12;
      const existingSession = await prisma.aiChatSession.findFirst({
        where: { id: sessionId, businessId },
        include: {
          messages: {
            orderBy: { createdAt: "desc" },
            take: MAX_HISTORY,
            select: { role: true, content: true }
          }
        }
      });

      if (existingSession) {
        resolvedSessionId = existingSession.id;
        // Messages were fetched newest-first; reverse to restore chronological order
        priorMessages = [...existingSession.messages].reverse().map((msg) => ({
          role: msg.role as "user" | "assistant" | "system",
          content: msg.content
        }));
      } else {
        // Session not found or wrong business — create a new one
        const newSession = await prisma.aiChatSession.create({
          data: {
            workspaceId: workspace.id,
            businessId,
            userId
          }
        });
        resolvedSessionId = newSession.id;
      }
    } else {
      const newSession = await prisma.aiChatSession.create({
        data: {
          workspaceId: workspace.id,
          businessId,
          userId
        }
      });
      resolvedSessionId = newSession.id;
    }

    // Persist the user message
    await prisma.aiChatMessage.create({
      data: {
        sessionId: resolvedSessionId,
        role: "user",
        content: message.trim()
      }
    });
  } catch (err) {
    logger.error({ err }, "ai.chat.session_setup_error");
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }

  // Enforce plan quota before touching the model — this also reserves a usage
  // slot atomically so concurrent requests can't exceed the limit.
  let usageId: string;
  try {
    const reserved = await reserveAiMessageQuota({
      businessId,
      sessionId: resolvedSessionId,
      userId
    });
    usageId = reserved.usageId;
  } catch (err) {
    if (err instanceof AiUsageQuotaExceededError) {
      return new Response(
        JSON.stringify(buildAiQuotaExceededResponse(err)),
        {
          status: 429,
          headers: { "Content-Type": "application/json" }
        }
      );
    }
    logger.error({ err }, "ai.chat.quota_reserve_error");
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }

  // Build messages history for RAG
  const chatHistory: ChatTurn[] = [
    ...priorMessages,
    { role: "user", content: message.trim() }
  ];

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const startedAt = Date.now();
      let ragAnswer: Awaited<ReturnType<typeof streamRagAnswer>> | null = null;

      try {
        ragAnswer = await streamRagAnswer({ businessId, messages: chatHistory });

        // Emit session id so client can track the session
        controller.enqueue(
          encoder.encode(sseFrame("session", { sessionId: resolvedSessionId }))
        );

        // Emit citations
        if (ragAnswer.citations.length > 0) {
          controller.enqueue(
            encoder.encode(sseFrame("citations", { citations: ragAnswer.citations }))
          );
        }

        // Stream tokens
        let assistantContent = "";
        for await (const chunk of ragAnswer.stream) {
          assistantContent += chunk;
          controller.enqueue(
            encoder.encode(sseFrame("message", { chunk }))
          );
        }

        // Await real token counts — the usage promise resolves in the
        // generator's finally block, so it's already settled by the time
        // we reach here.
        const tokenUsage = await ragAnswer.usage;
        const totalTokens = tokenUsage.inputTokens + tokenUsage.outputTokens;

        // Persist assistant response and finalize usage record with real counts
        const latencyMs = Date.now() - startedAt;
        await Promise.all([
          prisma.aiChatMessage.create({
            data: {
              sessionId: resolvedSessionId,
              role: "assistant",
              content: assistantContent,
              model: ragAnswer.model ?? undefined,
              latencyMs,
              metadata: ragAnswer.citations.length > 0
                ? { citations: ragAnswer.citations, runtime: ragAnswer.runtime }
                : { runtime: ragAnswer.runtime }
            }
          }).catch((err: unknown) => {
            logger.error({ err }, "ai.chat.persist_assistant_message_error");
          }),
          finalizeAiTokenUsage({
            usageId,
            runtime: ragAnswer.runtime ?? "unknown",
            model: ragAnswer.model ?? null,
            sessionId: resolvedSessionId,
            userId,
            promptTokens: tokenUsage.inputTokens || null,
            completionTokens: tokenUsage.outputTokens || null,
            totalTokens: totalTokens || null,
            cacheReadTokens: tokenUsage.cacheReadTokens || null,
            cacheCreationTokens: tokenUsage.cacheCreationTokens || null,
          }).catch((err: unknown) => {
            logger.error({ err }, "ai.chat.finalize_usage_error");
          })
        ]);

        captureEvent({ userId, event: "ai.message_sent", properties: { businessId, runtime: ragAnswer.runtime, model: ragAnswer.model ?? undefined, citationCount: ragAnswer.citations.length, totalTokens: totalTokens || undefined } });
        controller.enqueue(encoder.encode("event: done\ndata: {}\n\n"));
      } catch (err) {
        logger.error({ err }, "ai.chat.stream_error");
        // Release the reserved usage slot so the quota isn't burned on error
        await releaseAiTokenUsage(usageId).catch(() => undefined);
        controller.enqueue(
          encoder.encode(sseFrame("error", { message: "An error occurred while generating a response." }))
        );
      } finally {
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no"
    }
  });
}
