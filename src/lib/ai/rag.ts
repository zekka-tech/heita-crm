import { anthropicConfigured, streamAnthropicChat } from "@/lib/ai/anthropic";
import { embedText } from "@/lib/ai/embeddings";
import { ollamaConfigured, streamOllamaChat } from "@/lib/ai/ollama";
import { findSimilarDocumentChunks, type SimilarityMatch } from "@/lib/ai/vector-store";
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

export type RagAnswerStream = {
  runtime: "ollama" | "anthropic" | "fallback";
  citations: RagCitation[];
  stream: AsyncGenerator<string>;
};

export type RagStreamInput = {
  businessId: string;
  messages: ChatTurn[];
};

const MAX_HISTORY = 12;

function defaultSystemPrompt(businessName: string) {
  return [
    `You are the AI co-worker for ${businessName}.`,
    "Answer clearly, concisely, and truthfully.",
    "Use the retrieved business documents as your primary source of truth.",
    "If the answer is not supported by the retrieved context, say that directly and suggest contacting the business team.",
    "Never invent hours, pricing, policies, availability, or legal claims."
  ].join(" ");
}

function uniqueCitations(matches: SimilarityMatch[]) {
  const seen = new Set<string>();
  const citations: RagCitation[] = [];

  for (const match of matches) {
    const key = `${match.documentId}:${match.chunkIndex}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    citations.push({
      documentId: match.documentId,
      documentTitle: match.documentTitle,
      chunkIndex: match.chunkIndex,
      similarity: match.similarity
    });
  }

  return citations;
}

function buildContext(matches: SimilarityMatch[]) {
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

async function buildSystemPrompt(input: { businessId: string; userMessage: string }) {
  const business = await prisma.business.findFirstOrThrow({
    where: { id: input.businessId, deletedAt: null },
    include: { aiWorkspace: true }
  });

  const queryEmbedding = await embedText(input.userMessage);
  const matches = await findSimilarDocumentChunks({
    businessId: input.businessId,
    queryEmbedding,
    limit: 5
  });

  const persona = business.aiWorkspace?.systemPrompt?.trim() || defaultSystemPrompt(business.name);
  const context = buildContext(matches);

  return {
    prompt: [persona, "Retrieved context:", context].join("\n\n"),
    citations: uniqueCitations(matches)
  };
}

export async function streamRagAnswer(input: RagStreamInput): Promise<RagAnswerStream> {
  const history = input.messages.slice(-MAX_HISTORY);
  const latestUserMessage = [...history].reverse().find((turn) => turn.role === "user");
  const question = latestUserMessage?.content?.trim();

  if (!question) {
    return {
      runtime: "fallback",
      citations: [],
      stream: (async function* () {
        yield "Please send a question to start the conversation.";
      })()
    };
  }

  const { prompt, citations } = await buildSystemPrompt({
    businessId: input.businessId,
    userMessage: question
  });

  if (ollamaConfigured()) {
    try {
      return {
        runtime: "ollama",
        citations,
        stream: streamOllamaChat({
          messages: [
            { role: "system", content: prompt },
            ...history.map((turn) => ({
              role: turn.role,
              content: turn.content
            }))
          ]
        })
      };
    } catch (error) {
      logger.warn({ err: error }, "rag.ollama_fallback");
    }
  }

  if (anthropicConfigured()) {
    return {
      runtime: "anthropic",
      citations,
      stream: streamAnthropicChat({
        system: prompt,
        messages: history
          .filter((turn) => turn.role !== "system")
          .map((turn) => ({
            role: turn.role === "assistant" ? "assistant" : "user",
            content: turn.content
          }))
      })
    };
  }

  return {
    runtime: "fallback",
    citations,
    stream: (async function* () {
      yield "AI co-worker is not configured for this environment. Add OLLAMA_BASE_URL or ANTHROPIC_API_KEY to enable replies.";
    })()
  };
}
