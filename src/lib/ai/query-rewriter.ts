/**
 * Multi-turn query rewriting for retrieval — B1.
 *
 * Short follow-up turns ("What about weekends?", "And the price?") rely on an
 * implicit referent from earlier in the conversation. Embedding them verbatim
 * retrieves the wrong chunks. This module rewrites such a follow-up into a
 * standalone search query that captures the user's intent without the prior
 * context, using whichever LLM is configured (Ollama → Anthropic), before the
 * query is embedded for hybrid retrieval.
 *
 * Design choices (mirroring the rest of the AI stack):
 * - Gated: single-turn questions and long, self-contained questions skip the
 *   LLM entirely, so the common case adds zero latency.
 * - Graceful fallback: on any failure (LLM unavailable, timeout, empty/garbage
 *   output) it falls back to `buildQueryForRetrieval`, the cheap heuristic that
 *   prepends a prior-reply excerpt — same Ollama→Anthropic→heuristic pattern as
 *   the reranker and summarizer. Never throws.
 * - Tight timeout: this is on the retrieval hot path (unlike the fire-and-forget
 *   summarizer), so the LLM call is bounded and the heuristic catches overruns.
 */

import { anthropicConfigured, streamAnthropicChat } from "@/lib/ai/anthropic";
import { ollamaConfigured, streamOllamaChat } from "@/lib/ai/ollama";
import { logger } from "@/lib/logger";
import type { ChatTurn } from "@/lib/ai/rag";

const MAX_HISTORY = 12;
// Questions at or above this length are treated as self-contained — no rewrite.
const STANDALONE_MIN_LENGTH = 120;
// Bound the LLM call: this runs before retrieval, in front of the user's reply.
const REWRITE_TIMEOUT_MS = 5_000;
// A rewrite longer than this means the model rambled or echoed the prompt —
// discard it and fall back to the heuristic.
const MAX_REWRITE_LENGTH = 300;
// How much prior dialogue to feed the rewriter, and how much of each turn.
const PRIOR_TURNS = 6;
const PRIOR_TURN_CHARS = 400;

function latestUserTurn(history: ChatTurn[]): ChatTurn | undefined {
  return [...history].reverse().find((m) => m.role === "user");
}

/**
 * Cheap, synchronous heuristic: prepend a short excerpt of the prior assistant
 * reply to a short follow-up so the embedding has some referent. Used as the
 * fallback when LLM rewriting is unavailable or fails, and exported (re-exported
 * from `rag.ts`) for the retrieval eval harness.
 */
export function buildQueryForRetrieval(messages: ChatTurn[]): string {
  const history = messages.slice(-MAX_HISTORY);
  const latestUser = latestUserTurn(history);
  if (!latestUser) return "";

  const question = latestUser.content.trim();

  // Only contextualize short follow-up questions that are likely to have
  // unresolved references. Long questions are self-contained.
  if (question.length >= STANDALONE_MIN_LENGTH) return question;

  const idx = [...history].lastIndexOf(latestUser);
  const priorAssistant = [...history]
    .slice(0, idx)
    .reverse()
    .find((m) => m.role === "assistant");

  if (priorAssistant) {
    return `${priorAssistant.content.slice(0, 300)}\n\n${question}`;
  }

  return question;
}

async function streamToString(gen: AsyncGenerator<string>): Promise<string> {
  let out = "";
  for await (const chunk of gen) out += chunk;
  return out.trim();
}

/** Strip wrapping quotes and common echoed prefixes from an LLM rewrite. */
function cleanRewrite(raw: string): string {
  let out = raw.trim();
  // Drop a leading label if the model echoed the prompt scaffolding.
  out = out.replace(/^(standalone (search )?query|query|rewritten question)\s*[:\-]\s*/i, "");
  // Strip a single layer of wrapping quotes.
  if (out.length >= 2 && /^["'`]/.test(out) && out.at(-1) === out[0]) {
    out = out.slice(1, -1).trim();
  }
  return out;
}

const REWRITE_SYSTEM_PROMPT =
  "You rewrite a follow-up question from a customer-support chat into a single, " +
  "standalone search query. Resolve pronouns and implicit references using the " +
  "conversation so the query makes sense on its own. Keep it short and keyword-rich. " +
  "If the question is already standalone, return it unchanged. " +
  "Output ONLY the rewritten query — no quotes, no preamble, no explanation.";

function buildRewriteUserMessage(prior: ChatTurn[], question: string): string {
  const dialogue = prior
    .filter((t) => t.role !== "system")
    .slice(-PRIOR_TURNS)
    .map(
      (t) =>
        `${t.role === "user" ? "Customer" : "Assistant"}: ${t.content.slice(0, PRIOR_TURN_CHARS)}`
    )
    .join("\n");

  return `Conversation so far:\n${dialogue}\n\nFollow-up question: ${question}\n\nStandalone search query:`;
}

async function llmRewrite(prior: ChatTurn[], question: string): Promise<string | null> {
  const userMessage = buildRewriteUserMessage(prior, question);

  if (ollamaConfigured()) {
    try {
      const { stream } = await streamOllamaChat({
        messages: [
          { role: "system", content: REWRITE_SYSTEM_PROMPT },
          { role: "user", content: userMessage },
        ],
        temperature: 0.1,
        signal: AbortSignal.timeout(REWRITE_TIMEOUT_MS),
      });
      return await streamToString(stream);
    } catch (err) {
      logger.warn({ err }, "query_rewriter.ollama_failed_trying_anthropic");
    }
  }

  if (anthropicConfigured()) {
    try {
      const { stream } = await streamAnthropicChat({
        system: REWRITE_SYSTEM_PROMPT,
        messages: [{ role: "user", content: userMessage }],
        maxTokens: 96,
        temperature: 0.1,
        signal: AbortSignal.timeout(REWRITE_TIMEOUT_MS),
      });
      return await streamToString(stream);
    } catch (err) {
      logger.warn({ err }, "query_rewriter.anthropic_failed");
    }
  }

  return null;
}

/**
 * Produce the query string used for embedding and FTS retrieval.
 *
 * Single-turn and long self-contained questions are returned verbatim. Short
 * follow-ups in a multi-turn chat are rewritten into a standalone query via the
 * configured LLM; any failure falls back to the {@link buildQueryForRetrieval}
 * heuristic. Never throws.
 */
export async function rewriteQueryForRetrieval(messages: ChatTurn[]): Promise<string> {
  const history = messages.slice(-MAX_HISTORY);
  const latestUser = latestUserTurn(history);
  if (!latestUser) return "";

  const question = latestUser.content.trim();

  // Long questions are self-contained — no need to spend an LLM call.
  if (question.length >= STANDALONE_MIN_LENGTH) return question;

  // No prior dialogue means this is the opening turn; nothing to resolve.
  const idx = [...history].lastIndexOf(latestUser);
  const prior = history.slice(0, idx).filter((t) => t.content.trim().length > 0);
  if (prior.length === 0) return question;

  const raw = await llmRewrite(prior, question);
  if (raw) {
    const cleaned = cleanRewrite(raw);
    if (cleaned && cleaned.length <= MAX_REWRITE_LENGTH) {
      logger.debug(
        { original: question.slice(0, 80), rewritten: cleaned.slice(0, 80) },
        "query_rewriter.rewritten"
      );
      return cleaned;
    }
  }

  // LLM unavailable or produced unusable output — fall back to the heuristic.
  return buildQueryForRetrieval(messages);
}
