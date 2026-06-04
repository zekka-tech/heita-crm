import { createHash } from "node:crypto";

import { logger } from "@/lib/logger";
import { getRedis } from "@/lib/redis";

const EMBED_CACHE_TTL_S = 60 * 60; // 1 hour — embeddings are deterministic per model

async function getCachedEmbedding(key: string): Promise<number[] | null> {
  const redis = getRedis();
  if (!redis) return null;
  try {
    const raw = await redis.get(key);
    return raw ? (JSON.parse(raw) as number[]) : null;
  } catch {
    return null;
  }
}

async function setCachedEmbedding(key: string, embedding: number[]): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.setex(key, EMBED_CACHE_TTL_S, JSON.stringify(embedding));
  } catch {
    // non-fatal
  }
}

const DEFAULT_DIMENSIONS = 1024;

type OllamaEmbedResponse = {
  embedding?: number[];
  embeddings?: number[][];
};

export function getEmbeddingRuntime() {
  return {
    ollamaModel: process.env.OLLAMA_EMBED_MODEL ?? "mxbai-embed-large",
    dimensions: DEFAULT_DIMENSIONS
  };
}

function ensureEmbeddingDimensions(embedding: number[]) {
  const { dimensions } = getEmbeddingRuntime();

  if (embedding.length === dimensions) {
    return embedding;
  }

  if (embedding.length > dimensions) {
    return embedding.slice(0, dimensions);
  }

  return [...embedding, ...Array.from({ length: dimensions - embedding.length }, () => 0)];
}

function fallbackEmbedding(input: string) {
  const { dimensions } = getEmbeddingRuntime();
  const digest = createHash("sha256").update(input).digest();
  const vector = Array.from({ length: dimensions }, (_, index) => {
    const byte = digest[index % digest.length] ?? 0;
    return byte / 255;
  });

  return ensureEmbeddingDimensions(vector);
}

async function embedWithOllama(input: string[], signal?: AbortSignal) {
  const baseUrl = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";
  const model = getEmbeddingRuntime().ollamaModel;

  const response = await fetch(`${baseUrl}/api/embed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      input
    }),
    signal
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Ollama embedding failed (${response.status}): ${text.slice(0, 200)}`);
  }

  const payload = (await response.json()) as OllamaEmbedResponse;
  const embeddings = payload.embeddings ?? (payload.embedding ? [payload.embedding] : null);

  if (!embeddings?.length) {
    throw new Error("Ollama embedding response did not include vectors.");
  }

  return embeddings.map(ensureEmbeddingDimensions);
}

export async function embedTexts(input: string[], signal?: AbortSignal) {
  if (!input.length) {
    return [];
  }

  if (process.env.OLLAMA_BASE_URL) {
    try {
      return await embedWithOllama(input, signal);
    } catch (error) {
      logger.warn({ err: error }, "ai.embed.ollama_failed");
      if (process.env.NODE_ENV === "production") {
        throw error;
      }
    }
  }

  logger.warn("ai.embed.fallback_active");
  return input.map((value) => fallbackEmbedding(value));
}

export async function embedText(input: string, signal?: AbortSignal): Promise<number[]> {
  const cacheKey = `embed:v1:${createHash("sha256").update(input).digest("hex")}`;

  const cached = await getCachedEmbedding(cacheKey);
  if (cached !== null) {
    return cached;
  }

  const results = await embedTexts([input], signal);
  const embedding = results[0] ?? [];

  await setCachedEmbedding(cacheKey, embedding);
  return embedding;
}
