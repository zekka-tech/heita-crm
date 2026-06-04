import { anthropicConfigured, streamAnthropicChat } from "@/lib/ai/anthropic";
import { embedText } from "@/lib/ai/embeddings";
import { checkAnswerGrounding } from "@/lib/ai/grounding";
import { ollamaConfigured, streamOllamaChat } from "@/lib/ai/ollama";
import { rerankChunks } from "@/lib/ai/reranker";
import { ZERO_USAGE, type StreamUsage } from "@/lib/ai/stream-types";
import { hybridSearch, type SimilarityMatch } from "@/lib/ai/vector-store";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

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
  runtime: "ollama" | "anthropic" | "fallback";
  model: string | null;
  prompt: string;
  citations: RagCitation[];
  /** The chunks passed to the LLM — used by the chat route for grounding checks. */
  retrievedChunks: SimilarityMatch[];
  stream: AsyncGenerator<string>;
  /** Resolves with real token counts after the stream is consumed or abandoned. */
  usage: Promise<StreamUsage>;
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

/** Exported for use in the RAG eval harness. */
export { buildQueryForRetrieval };

/**
 * Build the string used for embedding and FTS retrieval.
 *
 * For follow-up turns in a conversation, short questions ("What about weekends?",
 * "And the price?") often rely on an implicit referent from the prior assistant
 * reply. Prepending a short excerpt of that reply gives the embedding model
 * enough context to retrieve the right chunks without an extra LLM call.
 */
function buildQueryForRetrieval(messages: ChatTurn[]): string {
  const history = messages.slice(-MAX_HISTORY);
  const latestUser = [...history].reverse().find((m) => m.role === "user");
  if (!latestUser) return "";

  const question = latestUser.content.trim();

  // Only contextualize short follow-up questions that are likely to have
  // unresolved references. Long questions are self-contained.
  if (question.length >= 120) return question;

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

async function buildSystemPrompt(input: { businessId: string; messages: ChatTurn[] }) {
  const business = await prisma.business.findFirstOrThrow({
    where: { id: input.businessId, deletedAt: null },
    include: { aiWorkspace: true },
  });

  const queryText = buildQueryForRetrieval(input.messages);
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

  const persona =
    business.aiWorkspace?.systemPrompt?.trim() || defaultSystemPrompt(business.name);
  const context = buildContext(topChunks);

  return {
    prompt: [persona, "Retrieved context:", context].join("\n\n"),
    citations: uniqueCitations(topChunks),
    topChunks,
  };
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
      return { runtime: "ollama", model, prompt, citations, retrievedChunks: topChunks, stream, usage };
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
    return { runtime: "anthropic", model, prompt, citations, retrievedChunks: topChunks, stream, usage };
  }

  return {
    runtime: "fallback",
    model: null,
    prompt,
    citations,
    retrievedChunks: [],
    stream: (async function* () {
      yield "AI co-worker is not configured for this environment. Add OLLAMA_BASE_URL or ANTHROPIC_API_KEY to enable replies.";
    })(),
    usage: Promise.resolve(ZERO_USAGE),
  };
}
