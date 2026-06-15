import { Job, Queue, type ConnectionOptions } from "bullmq";

import { logger } from "@/lib/logger";
import { getQueueRedis } from "@/lib/redis";
import { processBusinessDocument } from "@/lib/ai/document-processor";

export const DOCUMENT_INGESTION_QUEUE = "document-ingestion";
export const DOCUMENT_INGESTION_DLQ = "document-ingestion-dlq";

type DocumentIngestionJob = {
  documentId: string;
  businessId: string;
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  var __heitaDocumentQueue__: Queue<DocumentIngestionJob, any, string, any, any, any> | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  var __heitaDocumentDlq__: Queue<any, any, string, any, any, any> | undefined;
}

export function getDocumentIngestionQueue() {
  const redis = getQueueRedis();
  if (!redis) {
    return null;
  }

  if (!global.__heitaDocumentQueue__) {
    global.__heitaDocumentQueue__ = new Queue<DocumentIngestionJob>(
      DOCUMENT_INGESTION_QUEUE,
      {
        connection: redis as unknown as ConnectionOptions,
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

export function getIngestionDlq() {
  const redis = getQueueRedis();
  if (!redis) {
    return null;
  }

  if (!global.__heitaDocumentDlq__) {
    global.__heitaDocumentDlq__ = new Queue(DOCUMENT_INGESTION_DLQ, {
      connection: redis as unknown as ConnectionOptions,
      defaultJobOptions: { removeOnComplete: 100, removeOnFail: false }
    });
  }

  return global.__heitaDocumentDlq__;
}

export async function enqueueDocumentIngestionJob(documentId: string, businessId: string) {
  const queue = getDocumentIngestionQueue();

  if (!queue || process.env.AI_INGEST_INLINE === "1") {
    const result = await processBusinessDocument({ documentId, businessId });
    return {
      enqueued: false,
      mode: "inline" as const,
      documentId,
      businessId,
      result
    };
  }

  const job = await queue.add(
    "ingest-document",
    { documentId, businessId },
    {
      jobId: `document:${documentId}`
    }
  );

  return {
    enqueued: true,
    mode: "queue" as const,
    documentId,
    businessId,
    jobId: job.id
  };
}

export async function handleDocumentIngestionJob(
  job: Job<DocumentIngestionJob>
) {
  logger.info({ jobId: job.id, documentId: job.data.documentId, businessId: job.data.businessId }, "ai.document.job_start");
  return processBusinessDocument(job.data);
}

export async function moveIngestionJobToDlq(
  job: Job<DocumentIngestionJob>,
  err: Error
): Promise<void> {
  const dlq = getIngestionDlq();
  if (!dlq) return;

  await dlq.add("failed-job", {
    jobId: job.id,
    data: job.data,
    error: err.message
  });
  logger.error({ jobId: job.id, err }, "ingestion.job.moved_to_dlq");
}
