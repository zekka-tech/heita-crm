import { logger } from "@/lib/logger";
import type { SimilarityMatch } from "@/lib/ai/vector-store";

type OllamaRerankResult = { index: number; relevance_score: number };
type OllamaRerankResponse = { results: OllamaRerankResult[] };

export function rerankerConfigured(): boolean {
  return Boolean(process.env.OLLAMA_BASE_URL && process.env.OLLAMA_RERANK_MODEL);
}

async function callOllamaRerank(input: {
  query: string;
  documents: string[];
  signal?: AbortSignal;
}): Promise<number[]> {
  const baseUrl = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";
  const model = process.env.OLLAMA_RERANK_MODEL!;

  const response = await fetch(`${baseUrl}/api/rerank`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, query: input.query, documents: input.documents }),
    signal: input.signal ?? AbortSignal.timeout(8_000),
  });

  if (!response.ok) {
    throw new Error(`Ollama rerank failed (${response.status})`);
  }

  const payload = (await response.json()) as OllamaRerankResponse;
  const scores = new Array<number>(input.documents.length).fill(0);
  for (const result of payload.results) {
    scores[result.index] = result.relevance_score;
  }
  return scores;
}

/**
 * Rerank candidate chunks using the configured Ollama bge-reranker model.
 * Falls back to the input order (from RRF fusion) if the model is unavailable,
 * not configured, or times out — same graceful-fallback pattern as Ollama→Anthropic.
 */
export async function rerankChunks(input: {
  query: string;
  chunks: SimilarityMatch[];
  topK?: number;
  signal?: AbortSignal;
}): Promise<SimilarityMatch[]> {
  const { chunks, topK = 5 } = input;

  if (chunks.length <= topK) return chunks;

  if (!rerankerConfigured()) {
    return chunks.slice(0, topK);
  }

  try {
    const scores = await callOllamaRerank({
      query: input.query,
      documents: chunks.map((c) => c.content),
      signal: input.signal,
    });

    return chunks
      .map((chunk, i) => ({ chunk, score: scores[i] ?? 0 }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map(({ chunk }) => chunk);
  } catch (err) {
    logger.warn({ err }, "reranker.ollama_unavailable_using_rrf_order");
    return chunks.slice(0, topK);
  }
}
