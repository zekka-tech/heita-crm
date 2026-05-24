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

export async function findSimilarDocumentChunks(input: {
  businessId: string;
  queryEmbedding: number[];
  limit?: number;
}) {
  const limit = input.limit ?? 5;
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

  return rows;
}
