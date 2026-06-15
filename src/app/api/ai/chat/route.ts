import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { checkAnswerGrounding } from "@/lib/ai/grounding";
import { streamRagAnswer, type ChatTurn } from "@/lib/ai/rag";
import { getCachedSummary, generateAndCacheSummary } from "@/lib/ai/summarizer";
import { csrfFailureResponse } from "@/lib/csrf";
import { logger } from "@/lib/logger";
import { enforceRateLimit } from "@/lib/rate-limit";
import { prisma, withBusinessScope } from "@/lib/prisma";
import { captureEvent } from "@/lib/telemetry";
import {
  AiUsageQuotaExceededError,
  checkAiMessageAllowance,
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

  // Cap input to prevent unbounded token spend (CRITICAL — §6.3 audit finding 3).
  const MAX_MESSAGE_CHARS = 8_000;
  if (message.trim().length > MAX_MESSAGE_CHARS) {
    return NextResponse.json(
      { error: `Message is too long. Please keep your message under ${MAX_MESSAGE_CHARS} characters.` },
      { status: 400 }
    );
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
  const staffMember = await withBusinessScope(business.id, (tx) =>
    tx.staffMember.findUnique({
      where: { businessId_userId: { businessId: business.id, userId } },
      select: { id: true }
    })
  );
  if (!staffMember) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const businessId = business.id;

  // Resolve or create AI workspace + session
  let resolvedSessionId: string;
  let priorMessages: ChatTurn[] = [];

  try {
    // Ensure workspace exists (upsert)
    const workspace = await withBusinessScope(businessId, (tx) =>
      tx.aiWorkspace.upsert({
        where: { businessId },
        create: { businessId },
        update: {}
      })
    );

    if (sessionId) {
      const MAX_HISTORY = 12;
      // Load MAX_HISTORY + 1 to detect whether older turns exist without
      // fetching the full history (which could be hundreds of messages).
      const existingSession = await withBusinessScope(businessId, (tx) =>
        tx.aiChatSession.findFirst({
          where: { id: sessionId, businessId },
          include: {
            messages: {
              orderBy: { createdAt: "desc" },
              take: MAX_HISTORY + 1,
              select: { role: true, content: true }
            }
          }
        })
      );

      if (existingSession) {
        resolvedSessionId = existingSession.id;
        const allLoaded = [...existingSession.messages].reverse();
        const hasOverflow = allLoaded.length > MAX_HISTORY;
        const recent = hasOverflow ? allLoaded.slice(-MAX_HISTORY) : allLoaded;

        // B6: inject a cached conversation summary when the session has overflowed
        // MAX_HISTORY so older context is not silently lost.
        if (hasOverflow) {
          const olderTurnCount = allLoaded.length - MAX_HISTORY;
          const cachedSummary = await getCachedSummary(resolvedSessionId, olderTurnCount);
          if (cachedSummary) {
            priorMessages = [
              { role: "system" as const, content: `Earlier conversation summary: ${cachedSummary}` },
              ...recent.map((m) => ({ role: m.role as "user" | "assistant" | "system", content: m.content }))
            ];
          } else {
            priorMessages = recent.map((m) => ({ role: m.role as "user" | "assistant" | "system", content: m.content }));
            // Fire-and-forget: load all older turns and generate/cache summary
            // asynchronously so it's available on the next turn.
            withBusinessScope(businessId, (tx) =>
              tx.aiChatMessage.findMany({
                where: { sessionId: resolvedSessionId },
                orderBy: { createdAt: "asc" },
                take: allLoaded.length - MAX_HISTORY,
                select: { role: true, content: true }
              })
            ).then((older) => {
              const olderTurns = older.map((m) => ({ role: m.role as "user" | "assistant" | "system", content: m.content }));
              generateAndCacheSummary(resolvedSessionId, olderTurns).catch(() => undefined);
            }).catch(() => undefined);
          }
        } else {
          priorMessages = recent.map((m) => ({
            role: m.role as "user" | "assistant" | "system",
            content: m.content
          }));
        }
      } else {
        // Session not found or wrong business — create a new one
        const newSession = await withBusinessScope(businessId, (tx) =>
          tx.aiChatSession.create({
            data: {
              workspaceId: workspace.id,
              businessId,
              userId
            }
          })
        );
        resolvedSessionId = newSession.id;
      }
    } else {
      const newSession = await withBusinessScope(businessId, (tx) =>
        tx.aiChatSession.create({
          data: {
            workspaceId: workspace.id,
            businessId,
            userId
          }
        })
      );
      resolvedSessionId = newSession.id;
    }

    // Persist the user message
    await withBusinessScope(businessId, (tx) =>
      tx.aiChatMessage.create({
        data: {
          sessionId: resolvedSessionId,
          role: "user",
          content: message.trim()
        }
      })
    );
  } catch (err) {
    logger.error({ err }, "ai.chat.session_setup_error");
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }

  // Check plan quota before touching the model. When the plan limit is reached,
  // stream a graceful SSE error frame so the client can render a friendly
  // message rather than receiving a hard HTTP error code mid-stream.
  const allowance = await checkAiMessageAllowance(businessId).catch((err: unknown) => {
    logger.error({ err }, "ai.chat.allowance_check_error");
    return null;
  });

  if (allowance && !allowance.allowed) {
    const encoder = new TextEncoder();
    const limitExceededStream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            `event: limit_exceeded\ndata: ${JSON.stringify({
              type: "limit_exceeded",
              tier: "PLAN",
              limit: allowance.limit,
              used: allowance.used,
              overagePrice: allowance.overagePriceZar
            })}\n\n`
          )
        );
        controller.enqueue(encoder.encode("event: done\ndata: {}\n\n"));
        controller.close();
      }
    });
    return new Response(limitExceededStream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no"
      }
    });
  }

  // Reserve a usage slot atomically so concurrent requests can't exceed the limit.
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
      // Race condition: quota was used up between our allowance check and the
      // atomic reserve. Stream a graceful SSE limit_exceeded frame.
      const encoder = new TextEncoder();
      const raceStream = new ReadableStream({
        start(controller) {
          controller.enqueue(
            encoder.encode(
              `event: limit_exceeded\ndata: ${JSON.stringify({
                type: "limit_exceeded",
                tier: "PLAN",
                limit: err.limit,
                used: err.used,
                overagePrice: err.overagePriceZar
              })}\n\n`
            )
          );
          controller.enqueue(encoder.encode("event: done\ndata: {}\n\n"));
          controller.close();
        }
      });
      return new Response(raceStream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
          "X-Accel-Buffering": "no"
        }
      });
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

        // If retrieval confidence is below the floor, prepend a soft-fail prefix
        // to the response so customers aren't misled by low-quality RAG answers.
        // This addresses §7.7.5: "AI hallucination on stock/pricing can create a
        // customer-trust incident."
        let assistantContent = "";
        if (ragAnswer.lowConfidencePrefix) {
          assistantContent = ragAnswer.lowConfidencePrefix;
          controller.enqueue(
            encoder.encode(sseFrame("message", { chunk: ragAnswer.lowConfidencePrefix }))
          );
        }

        // Stream tokens
        for await (const chunk of ragAnswer.stream) {
          assistantContent += chunk;
          controller.enqueue(
            encoder.encode(sseFrame("message", { chunk }))
          );
        }

        // Await real token counts — the usage promise resolves in the
        // generator's finally block, so it's already settled by the time
        // we reach here.
        const completedAnswer = ragAnswer;
        if (!completedAnswer) {
          throw new Error("RAG stream completed without an answer instance.");
        }

        const tokenUsage = await completedAnswer.usage;
        const totalTokens = tokenUsage.inputTokens + tokenUsage.outputTokens;

        // Persist assistant response and finalize usage record with real counts
        const latencyMs = Date.now() - startedAt;
        await Promise.all([
          withBusinessScope(businessId, (tx) =>
            tx.aiChatMessage.create({
              data: {
                sessionId: resolvedSessionId,
                role: "assistant",
                content: assistantContent,
                model: completedAnswer.model ?? undefined,
                latencyMs,
                metadata: completedAnswer.citations.length > 0
                  ? { citations: completedAnswer.citations, runtime: completedAnswer.runtime }
                  : { runtime: completedAnswer.runtime }
              }
            })
          ).catch((err: unknown) => {
            logger.error({ err }, "ai.chat.persist_assistant_message_error");
          }),
          finalizeAiTokenUsage({
            businessId,
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

        // Grounding check: log when the answer doesn't appear to reference the
        // retrieved context — a signal that retrieval quality may have degraded.
        const grounding = checkAnswerGrounding(assistantContent, ragAnswer.retrievedChunks);
        if (!grounding.grounded && ragAnswer.retrievedChunks.length > 0) {
          logger.warn(
            { businessId, reason: grounding.reason, citationCount: ragAnswer.citations.length },
            "rag.answer_ungrounded"
          );
        }
        captureEvent({ userId, event: "ai.message_sent", properties: { businessId, runtime: ragAnswer.runtime, model: ragAnswer.model ?? undefined, citationCount: ragAnswer.citations.length, totalTokens: totalTokens || undefined, grounded: grounding.grounded } });
        controller.enqueue(encoder.encode("event: done\ndata: {}\n\n"));
      } catch (err) {
        logger.error({ err }, "ai.chat.stream_error");
        // Release the reserved usage slot so the quota isn't burned on error
        await releaseAiTokenUsage({ businessId, usageId }).catch(() => undefined);
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
