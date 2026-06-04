/**
 * Conversation summarization — B6.
 *
 * When a session exceeds MAX_HISTORY turns the oldest messages are silently
 * dropped, losing context for long support conversations. This module
 * summarises the older portion into a short paragraph that gets prepended as
 * a synthetic system message, so the model always has the full story.
 *
 * Design choices:
 * - Redis cache: key conv-summary:{sessionId}, TTL 2h. Re-generated only when
 *   the summary length (number of older turns) grows past the next threshold.
 * - Summarization is async/fire-and-forget from the chat route so it never
 *   adds latency to the active turn. The first few turns after overflow have
 *   no summary (acceptable); by the next turn it is cached.
 * - Uses whichever LLM is configured (Ollama → Anthropic fallback), consuming
 *   the stream to completion. No new API surface needed.
 */

import { ollamaConfigured, streamOllamaChat } from "@/lib/ai/ollama";
import { anthropicConfigured, streamAnthropicChat } from "@/lib/ai/anthropic";
import { logger } from "@/lib/logger";
import { getRedis } from "@/lib/redis";
import type { ChatTurn } from "@/lib/ai/rag";

const CACHE_TTL_S = 2 * 60 * 60; // 2 hours
// Re-summarise when the older-turn count crosses one of these thresholds.
// Keeps the summary reasonably current without hammering the LLM.
const SUMMARISE_AT = [6, 12, 20, 30, 50] as const;

function cacheKey(sessionId: string, threshold: number): string {
  return `conv-summary:${sessionId}:${threshold}`;
}

function thresholdFor(olderTurnCount: number): number {
  for (const t of [...SUMMARISE_AT].reverse()) {
    if (olderTurnCount >= t) return t;
  }
  return SUMMARISE_AT[0];
}

async function streamToString(gen: AsyncGenerator<string>): Promise<string> {
  let out = "";
  for await (const chunk of gen) out += chunk;
  return out.trim();
}

async function generateSummary(turns: ChatTurn[]): Promise<string | null> {
  // Only summarise if there's meaningful dialogue to compress.
  const dialogue = turns
    .filter((t) => t.role !== "system")
    .map((t) => `${t.role === "user" ? "Customer" : "Assistant"}: ${t.content.slice(0, 600)}`)
    .join("\n");

  if (!dialogue.trim()) return null;

  const systemPrompt =
    "You are a conversation summariser. Summarise the following dialogue in 2-4 sentences. " +
    "Preserve key facts, questions asked, decisions made, and any specific values (prices, dates, quantities). " +
    "Write in third person. Be concise.";
  const userMessage = `Dialogue:\n${dialogue}\n\nSummary:`;

  if (ollamaConfigured()) {
    try {
      const { stream } = await streamOllamaChat({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        temperature: 0.2,
        signal: AbortSignal.timeout(15_000),
      });
      return await streamToString(stream);
    } catch (err) {
      logger.warn({ err }, "summarizer.ollama_failed_trying_anthropic");
    }
  }

  if (anthropicConfigured()) {
    try {
      const { stream } = await streamAnthropicChat({
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
        maxTokens: 256,
        temperature: 0.2,
        signal: AbortSignal.timeout(15_000),
      });
      return await streamToString(stream);
    } catch (err) {
      logger.warn({ err }, "summarizer.anthropic_failed");
    }
  }

  return null;
}

/** Read a cached summary from Redis. Returns null on miss or Redis error. */
export async function getCachedSummary(
  sessionId: string,
  olderTurnCount: number
): Promise<string | null> {
  const redis = getRedis();
  if (!redis) return null;
  const key = cacheKey(sessionId, thresholdFor(olderTurnCount));
  try {
    return await redis.get(key);
  } catch {
    return null;
  }
}

/**
 * Generate and cache a summary for the older turns of a session.
 * Safe to call fire-and-forget — never throws.
 */
export async function generateAndCacheSummary(
  sessionId: string,
  olderTurns: ChatTurn[]
): Promise<void> {
  if (olderTurns.length < 2) return;
  const redis = getRedis();
  if (!redis) return;

  const threshold = thresholdFor(olderTurns.length);
  const key = cacheKey(sessionId, threshold);

  // Only generate if not already cached for this threshold bucket.
  try {
    const existing = await redis.get(key);
    if (existing) return;
  } catch {
    return;
  }

  try {
    const summary = await generateSummary(olderTurns);
    if (!summary) return;
    await redis.setex(key, CACHE_TTL_S, summary);
    logger.info(
      { sessionId, olderTurns: olderTurns.length, threshold },
      "summarizer.summary_cached"
    );
  } catch (err) {
    logger.warn({ err, sessionId }, "summarizer.cache_write_failed");
  }
}
