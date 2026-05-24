import { Job, Queue } from "bullmq";

import { logger } from "@/lib/logger";
import { getRedis } from "@/lib/redis";
import { processBusinessDocument } from "@/lib/ai/document-processor";

export const DOCUMENT_INGESTION_QUEUE = "document-ingestion";

type DocumentIngestionJob = {
  documentId: string;
};

declare global {
  var __heitaDocumentQueue__: Queue<DocumentIngestionJob> | undefined;
}

export function getDocumentIngestionQueue() {
  const redis = getRedis();
  if (!redis) {
    return null;
  }

  if (!global.__heitaDocumentQueue__) {
    global.__heitaDocumentQueue__ = new Queue<DocumentIngestionJob>(
      DOCUMENT_INGESTION_QUEUE,
      {
        connection: redis,
        defaultJobOptions: {
          removeOnComplete: 100,
          removeOnFail: 500,
          attempts: 3,
          backoff: {
            type: "exponential",
            delay: 1000
          }
        }
      }
    );
  }

  return global.__heitaDocumentQueue__;
}

export async function enqueueDocumentIngestionJob(documentId: string) {
  const queue = getDocumentIngestionQueue();

  if (!queue || process.env.AI_INGEST_INLINE === "1") {
    const result = await processBusinessDocument(documentId);
    return {
      enqueued: false,
      mode: "inline" as const,
      documentId,
      result
    };
  }

  const job = await queue.add(
    "ingest-document",
    { documentId },
    {
      jobId: `document:${documentId}`
    }
  );

  return {
    enqueued: true,
    mode: "queue" as const,
    documentId,
    jobId: job.id
  };
}

export async function handleDocumentIngestionJob(
  job: Job<DocumentIngestionJob>
) {
  logger.info({ jobId: job.id, documentId: job.data.documentId }, "ai.document.job_start");
  return processBusinessDocument(job.data.documentId);
}
