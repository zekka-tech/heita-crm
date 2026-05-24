import { parse as parseCsv } from "csv-parse/sync";
import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";
import { DocumentStatus } from "@prisma/client";

import { embedTexts } from "@/lib/ai/embeddings";
import { replaceDocumentChunks } from "@/lib/ai/vector-store";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { getStoredObjectBuffer } from "@/lib/storage";

const CHUNK_SIZE = 1000;
const CHUNK_OVERLAP = 200;
const EMBED_BATCH_SIZE = 20;

type ParsedDocument = {
  text: string;
  metadata?: Record<string, unknown>;
};

type ChunkRecord = {
  chunkIndex: number;
  content: string;
  metadata: Record<string, unknown>;
};

function sanitizeText(input: string) {
  return input.replace(/\0/g, "").replace(/\s+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function splitIntoChunks(text: string) {
  const cleaned = sanitizeText(text);
  if (!cleaned) {
    return [];
  }

  const chunks: ChunkRecord[] = [];
  let start = 0;
  let index = 0;

  while (start < cleaned.length) {
    const end = Math.min(start + CHUNK_SIZE, cleaned.length);
    const content = cleaned.slice(start, end).trim();

    if (content) {
      chunks.push({
        chunkIndex: index,
        content,
        metadata: {
          startOffset: start,
          endOffset: end
        }
      });
      index += 1;
    }

    if (end >= cleaned.length) {
      break;
    }

    start = Math.max(end - CHUNK_OVERLAP, start + 1);
  }

  return chunks;
}

async function parseDocument(input: { mimeType: string; buffer: Buffer }) {
  switch (input.mimeType) {
    case "application/pdf": {
      const parser = new PDFParse({ data: input.buffer });
      try {
        const parsed = await parser.getText();
        return {
          text: parsed.text,
          metadata: {
            pages: parsed.total
          }
        } satisfies ParsedDocument;
      } finally {
        await parser.destroy();
      }
    }
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {
      const parsed = await mammoth.extractRawText({
        buffer: input.buffer
      });
      return {
        text: parsed.value
      } satisfies ParsedDocument;
    }
    case "text/csv": {
      const rows = parseCsv(input.buffer.toString("utf8"), {
        relax_column_count: true,
        skip_empty_lines: true,
        bom: true
      }) as string[][];

      return {
        text: rows.map((row) => row.join(", ")).join("\n")
      } satisfies ParsedDocument;
    }
    case "text/plain":
    case "text/markdown": {
      return {
        text: input.buffer.toString("utf8")
      } satisfies ParsedDocument;
    }
    default:
      throw new Error(`Unsupported document type: ${input.mimeType}`);
  }
}

async function buildEmbeddings(chunks: ChunkRecord[]) {
  const vectors: number[][] = [];

  for (let index = 0; index < chunks.length; index += EMBED_BATCH_SIZE) {
    const batch = chunks.slice(index, index + EMBED_BATCH_SIZE);
    const embeddings = await embedTexts(batch.map((chunk) => chunk.content));
    vectors.push(...embeddings);
  }

  return chunks.map((chunk, index) => ({
    ...chunk,
    embedding: vectors[index] ?? []
  }));
}

export async function processBusinessDocument(documentId: string) {
  const document = await prisma.businessDocument.findUniqueOrThrow({
    where: { id: documentId }
  });

  await prisma.businessDocument.update({
    where: { id: documentId },
    data: {
      status: DocumentStatus.PROCESSING,
      errorMessage: null
    }
  });

  try {
    const buffer = await getStoredObjectBuffer(document.storageKey);
    const parsed = await parseDocument({
      mimeType: document.mimeType,
      buffer
    });

    const chunks = splitIntoChunks(parsed.text);

    if (!chunks.length) {
      throw new Error("The uploaded document did not contain extractable text.");
    }

    const chunksWithEmbeddings = await buildEmbeddings(chunks);
    await replaceDocumentChunks({
      documentId: document.id,
      businessId: document.businessId,
      chunks: chunksWithEmbeddings.map((chunk) => ({
        chunkIndex: chunk.chunkIndex,
        content: chunk.content,
        metadata: {
          ...chunk.metadata,
          ...(parsed.metadata ?? {})
        },
        embedding: chunk.embedding
      }))
    });

    await prisma.businessDocument.update({
      where: { id: documentId },
      data: {
        status: DocumentStatus.READY,
        errorMessage: null
      }
    });

    logger.info(
      {
        documentId,
        businessId: document.businessId,
        chunks: chunks.length
      },
      "ai.document.ready"
    );

    return {
      status: DocumentStatus.READY,
      chunks: chunks.length
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Document processing failed.";

    await prisma.businessDocument.update({
      where: { id: documentId },
      data: {
        status: DocumentStatus.FAILED,
        errorMessage: message
      }
    });

    logger.error(
      {
        err: error,
        documentId,
        businessId: document.businessId
      },
      "ai.document.failed"
    );

    throw error;
  }
}

export async function enqueueDocumentIngestion(documentId: string) {
  const { enqueueDocumentIngestionJob } = await import("@/lib/ai/ingestion-queue");
  return enqueueDocumentIngestionJob(documentId);
}
