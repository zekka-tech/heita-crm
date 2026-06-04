import { randomUUID } from "node:crypto";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export type StoredChunkInput = {
  chunkIndex: number;
  content: string;
  metadata?: Record<string, unknown> | null;
  embedding: number[];
};

export type SimilarityMatch = {
  id: string;
  documentId: string;
  documentTitle: string;
  chunkIndex: number;
  content: string;
  metadata: Record<string, unknown> | null;
  similarity: number;
};

function toVectorLiteral(values: number[]) {
  return `[${values.map((value) => Number(value).toFixed(8)).join(",")}]`;
}

export function getVectorStoreConfig() {
  return {
    tableName: "DocumentChunk",
    vectorColumnName: "embedding",
    dimensions: 1024
  };
}

export async function replaceDocumentChunks(input: {
  documentId: string;
  businessId: string;
  chunks: StoredChunkInput[];
}) {
  await prisma.documentChunk.deleteMany({
    where: {
      documentId: input.documentId
    }
  });

  if (!input.chunks.length) {
    return;
  }

  const values = input.chunks.map((chunk) => {
    const metadata = chunk.metadata
      ? Prisma.sql`${JSON.stringify(chunk.metadata)}::jsonb`
      : Prisma.sql`NULL`;

    return Prisma.sql`(
      ${randomUUID()},
      ${input.documentId},
      ${input.businessId},
      ${chunk.chunkIndex},
      ${chunk.content},
      ${metadata},
      ${toVectorLiteral(chunk.embedding)}::vector
    )`;
  });

  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "DocumentChunk" (
      "id",
      "documentId",
      "businessId",
      "chunkIndex",
      "content",
      "metadata",
      "embedding"
    )
    VALUES ${Prisma.join(values)}
  `);
}

// Default over-fetch size for the vector search before threshold + reranking.
const VECTOR_CANDIDATE_LIMIT = 20;

// Minimum cosine similarity for a chunk to be included in retrieved context.
// Below this threshold the model is told no supporting context was found,
// which is safer than stuffing irrelevant chunks into the prompt.
const DEFAULT_SIMILARITY_THRESHOLD = 0.25;

// RRF constant — 60 is the standard value from the original paper.
const RRF_K = 60;

function rrfScore(rank: number): number {
  return 1 / (RRF_K + rank + 1);
}

export async function findSimilarDocumentChunks(input: {
  businessId: string;
  queryEmbedding: number[];
  limit?: number;
  threshold?: number;
}) {
  const limit = input.limit ?? VECTOR_CANDIDATE_LIMIT;
  const threshold = input.threshold ?? DEFAULT_SIMILARITY_THRESHOLD;
  const vectorLiteral = toVectorLiteral(input.queryEmbedding);

  const rows = await prisma.$queryRaw<SimilarityMatch[]>(Prisma.sql`
    SELECT
      dc."id",
      dc."documentId",
      d."title" AS "documentTitle",
      dc."chunkIndex",
      dc."content",
      dc."metadata",
      1 - (dc."embedding" <=> ${vectorLiteral}::vector) AS "similarity"
    FROM "DocumentChunk" dc
    INNER JOIN "BusinessDocument" d ON d."id" = dc."documentId"
    WHERE dc."businessId" = ${input.businessId}
      AND d."status" = 'READY'
      AND dc."embedding" IS NOT NULL
    ORDER BY dc."embedding" <=> ${vectorLiteral}::vector
    LIMIT ${limit}
  `);

  return rows.filter((r) => r.similarity >= threshold);
}

/**
 * Full-text search over chunk content using Postgres websearch_to_tsquery.
 * Requires the GIN functional index added in migration 0030.
 * Returns empty on blank/unsearchable queries rather than throwing.
 */
export async function findChunksByFts(input: {
  businessId: string;
  queryText: string;
  limit?: number;
}): Promise<SimilarityMatch[]> {
  const limit = input.limit ?? VECTOR_CANDIDATE_LIMIT;
  const query = input.queryText.trim();
  if (!query) return [];

  type FtsRow = Omit<SimilarityMatch, "similarity"> & { rank: number };

  try {
    const rows = await prisma.$queryRaw<FtsRow[]>(Prisma.sql`
      SELECT
        dc."id",
        dc."documentId",
        d."title" AS "documentTitle",
        dc."chunkIndex",
        dc."content",
        dc."metadata",
        ts_rank_cd(to_tsvector('english', dc."content"),
                   websearch_to_tsquery('english', ${query})) AS rank
      FROM "DocumentChunk" dc
      INNER JOIN "BusinessDocument" d ON d."id" = dc."documentId"
      WHERE dc."businessId" = ${input.businessId}
        AND d."status" = 'READY'
        AND to_tsvector('english', dc."content") @@ websearch_to_tsquery('english', ${query})
      ORDER BY rank DESC
      LIMIT ${limit}
    `);

    return rows.map((row) => ({ ...row, similarity: Number(row.rank) }));
  } catch {
    // FTS index may not exist in a dev environment that hasn't run the migration.
    return [];
  }
}

/**
 * Hybrid search: vector (semantic) + full-text (keyword) fused via
 * Reciprocal Rank Fusion. Returns up to candidateLimit results, ordered by
 * combined RRF score, for the reranker to further refine.
 */
export async function hybridSearch(input: {
  businessId: string;
  queryEmbedding: number[];
  queryText: string;
  candidateLimit?: number;
  threshold?: number;
}): Promise<SimilarityMatch[]> {
  const candidateLimit = input.candidateLimit ?? VECTOR_CANDIDATE_LIMIT;
  const threshold = input.threshold ?? DEFAULT_SIMILARITY_THRESHOLD;

  const [vectorResults, ftsResults] = await Promise.all([
    findSimilarDocumentChunks({
      businessId: input.businessId,
      queryEmbedding: input.queryEmbedding,
      limit: candidateLimit,
      threshold,
    }),
    findChunksByFts({
      businessId: input.businessId,
      queryText: input.queryText,
      limit: candidateLimit,
    }),
  ]);

  // Fuse results with RRF.
  const scoreMap = new Map<string, { match: SimilarityMatch; score: number }>();

  vectorResults.forEach((match, i) => {
    const key = `${match.documentId}:${match.chunkIndex}`;
    const entry = scoreMap.get(key) ?? { match, score: 0 };
    entry.score += rrfScore(i);
    scoreMap.set(key, entry);
  });

  ftsResults.forEach((match, i) => {
    const key = `${match.documentId}:${match.chunkIndex}`;
    const entry = scoreMap.get(key) ?? { match, score: 0 };
    entry.score += rrfScore(i);
    scoreMap.set(key, entry);
  });

  return [...scoreMap.values()]
    .sort((a, b) => b.score - a.score)
    .map(({ match }) => match);
}
