import { anthropicConfigured, streamAnthropicChat } from "@/lib/ai/anthropic";
import { embedText } from "@/lib/ai/embeddings";
import { ollamaConfigured, streamOllamaChat } from "@/lib/ai/ollama";
import { streamByokChat } from "@/lib/ai/providers";
import {
  buildQueryForRetrieval,
  rewriteQueryForRetrieval,
} from "@/lib/ai/query-rewriter";
import { rerankChunks } from "@/lib/ai/reranker";
import { ZERO_USAGE, type StreamUsage } from "@/lib/ai/stream-types";
import { hybridSearch, type SimilarityMatch } from "@/lib/ai/vector-store";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import {
  recordByokRuntimeError,
  resolveActiveByokRuntime,
} from "@/server/services/ai-provider.service";

export type ChatTurn = {
  role: "user" | "assistant" | "system";
  content: string;
};

export type RagCitation = {
  documentId: string;
  documentTitle: string;
  chunkIndex: number;
  similarity: number;
};

export type { StreamUsage };

export type RagAnswerStream = {
  /** "byok:<provider>" | "ollama" | "anthropic" | "fallback" */
  runtime: string;
  model: string | null;
  prompt: string;
  citations: RagCitation[];
  /** The chunks passed to the LLM — used by the chat route for grounding checks. */
  retrievedChunks: SimilarityMatch[];
  stream: AsyncGenerator<string>;
  /** Resolves with real token counts after the stream is consumed or abandoned. */
  usage: Promise<StreamUsage>;
  /**
   * When the top retrieved chunk falls below the AI_CONFIDENCE_FLOOR threshold,
   * this prefix is prepended to the streamed response as a soft hallucination guard
   * (§7.7.5 of the CTO advisory memo).
   */
  lowConfidencePrefix: string | null;
};

export type RagStreamInput = {
  businessId: string;
  messages: ChatTurn[];
};

const MAX_HISTORY = 12;
// Final top-K chunks passed to the LLM after threshold + reranking.
const TOP_K_CONTEXT = 5;

function defaultSystemPrompt(businessName: string) {
  return [
    `You are the AI co-worker for ${businessName}.`,
    "Answer clearly, concisely, and truthfully.",
    "Use the retrieved business documents as your primary source of truth.",
    "If the answer is not supported by the retrieved context, say that directly and suggest contacting the business team.",
    "Never invent hours, pricing, policies, availability, or legal claims.",
  ].join(" ");
}

function uniqueCitations(matches: SimilarityMatch[]): RagCitation[] {
  const seen = new Set<string>();
  const citations: RagCitation[] = [];

  for (const match of matches) {
    const key = `${match.documentId}:${match.chunkIndex}`;
    if (seen.has(key)) continue;
    seen.add(key);
    citations.push({
      documentId: match.documentId,
      documentTitle: match.documentTitle,
      chunkIndex: match.chunkIndex,
      similarity: match.similarity,
    });
  }

  return citations;
}

function buildContext(matches: SimilarityMatch[]): string {
  if (!matches.length) {
    return "No supporting business documents were retrieved for this question.";
  }

  return matches
    .map(
      (match, index) =>
        `Source ${index + 1} (${match.documentTitle}, chunk ${match.chunkIndex + 1}, similarity ${match.similarity.toFixed(3)}):\n${match.content}`
    )
    .join("\n\n");
}

/**
 * Re-exported for the RAG eval harness. `buildQueryForRetrieval` is the
 * synchronous heuristic; production retrieval uses the LLM-backed
 * `rewriteQueryForRetrieval`, which falls back to this heuristic.
 */
export { buildQueryForRetrieval };

async function buildSystemPrompt(input: { businessId: string; messages: ChatTurn[] }) {
  const business = await prisma.business.findFirstOrThrow({
    where: { id: input.businessId, deletedAt: null },
    include: { aiWorkspace: true },
  });

  // Rewrite multi-turn follow-ups into a standalone query before retrieval;
  // falls back to the heuristic when no LLM is configured or the call fails.
  const queryText = await rewriteQueryForRetrieval(input.messages);
  const queryEmbedding = await embedText(queryText);

  // 1. Hybrid retrieval: semantic (vector, cached embedding) + keyword (FTS) fused via RRF.
  const candidates = await hybridSearch({
    businessId: input.businessId,
    queryEmbedding,
    queryText,
  });

  // 2. Rerank candidates with bge-reranker (falls back to RRF order gracefully).
  const topChunks = await rerankChunks({
    query: queryText,
    chunks: candidates,
    topK: TOP_K_CONTEXT,
  });

  if (candidates.length === 0) {
    logger.info(
      { businessId: input.businessId, query: queryText.slice(0, 80) },
      "rag.no_chunks_above_threshold"
    );
  }

  // Cap systemPrompt to prevent unbounded token consumption and prompt injection
  // via overly large or adversarial workspace configurations (audit finding 2).
  const MAX_SYSTEM_PROMPT_CHARS = 4_096;
  const rawPrompt = business.aiWorkspace?.systemPrompt?.trim() ?? "";
  const persona =
    rawPrompt.length > 0
      ? rawPrompt.slice(0, MAX_SYSTEM_PROMPT_CHARS)
      : defaultSystemPrompt(business.name);
  const context = buildContext(topChunks);

  return {
    prompt: [persona, "Retrieved context:", context].join("\n\n"),
    citations: uniqueCitations(topChunks),
    topChunks,
  };
}

/**
 * Returns a soft-fail prefix when the top retrieved chunk falls below the
 * configured confidence floor. Addresses §7.7.5 of the CTO advisory memo:
 * "AI hallucination on stock/pricing can create a customer-trust incident."
 *
 * Configurable via AI_CONFIDENCE_FLOOR env var (default 0.35).
 */
function buildLowConfidencePrefix(topChunks: SimilarityMatch[]): string | null {
  const confidenceFloor = env.AI_CONFIDENCE_FLOOR;
  if (topChunks.length === 0 || (topChunks[0]?.similarity ?? 0) < confidenceFloor) {
    logger.info(
      {
        topSimilarity: topChunks[0]?.similarity ?? null,
        confidenceFloor,
      },
      "rag.low_confidence_prefix"
    );
    return "I don't have enough information about that in my knowledge base. ";
  }
  return null;
}

export async function streamRagAnswer(input: RagStreamInput): Promise<RagAnswerStream> {
  const history = input.messages.slice(-MAX_HISTORY);
  const latestUserMessage = [...history].reverse().find((turn) => turn.role === "user");
  const question = latestUserMessage?.content?.trim();

  if (!question) {
    return {
      runtime: "fallback",
      model: null,
      prompt: "",
      citations: [],
      retrievedChunks: [],
      lowConfidencePrefix: null,
      stream: (async function* () {
        yield "Please send a question to start the conversation.";
      })(),
      usage: Promise.resolve(ZERO_USAGE),
    };
  }

  const { prompt, citations, topChunks } = await buildSystemPrompt({
    businessId: input.businessId,
    messages: history,
  });

  const lowConfidencePrefix = buildLowConfidencePrefix(topChunks);

  // Bring-your-own-model: when the business has connected its own provider
  // key, that connection is the brain. Failures degrade to the platform
  // runtimes below and are recorded against the connection for the dashboard.
  const byok = await resolveActiveByokRuntime(input.businessId);
  if (byok) {
    try {
      const { stream, usage } = await streamByokChat(byok, {
        system: prompt,
        messages: history
          .filter((turn) => turn.role !== "system")
          .map((turn) => ({
            role: turn.role === "assistant" ? ("assistant" as const) : ("user" as const),
            content: turn.content,
          })),
      });
      return {
        runtime: `byok:${byok.provider.toLowerCase()}`,
        model: byok.model,
        prompt,
        citations,
        retrievedChunks: topChunks,
        lowConfidencePrefix,
        stream,
        usage,
      };
    } catch (error) {
      logger.warn(
        { err: error, businessId: input.businessId, provider: byok.provider },
        "rag.byok_fallback"
      );
      recordByokRuntimeError({
        connectionId: byok.connectionId,
        businessId: input.businessId,
        message: error instanceof Error ? error.message : "Provider request failed.",
      }).catch(() => undefined);
    }
  }

  if (ollamaConfigured()) {
    try {
      const model = process.env.OLLAMA_CHAT_MODEL ?? "llama3.2";
      const { stream, usage } = await streamOllamaChat({
        messages: [
          { role: "system", content: prompt },
          ...history.map((turn) => ({
            role: turn.role,
            content: turn.content,
          })),
        ],
      });
      return { runtime: "ollama", model, prompt, citations, retrievedChunks: topChunks, lowConfidencePrefix, stream, usage };
    } catch (error) {
      logger.warn({ err: error }, "rag.ollama_fallback");
    }
  }

  if (anthropicConfigured()) {
    const model = process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001";
    const { stream, usage } = await streamAnthropicChat({
      system: prompt,
      messages: history
        .filter((turn) => turn.role !== "system")
        .map((turn) => ({
          role: turn.role === "assistant" ? "assistant" : "user",
          content: turn.content,
        })),
      model,
      enablePromptCache: true,
    });
    return { runtime: "anthropic", model, prompt, citations, retrievedChunks: topChunks, lowConfidencePrefix, stream, usage };
  }

  return {
    runtime: "fallback",
    model: null,
    prompt,
    citations,
    retrievedChunks: [],
    lowConfidencePrefix: null,
    stream: (async function* () {
      yield "AI co-worker is not configured for this environment. Add OLLAMA_BASE_URL or ANTHROPIC_API_KEY to enable replies.";
    })(),
    usage: Promise.resolve(ZERO_USAGE),
  };
}
