import { Worker } from "bullmq";

import {
  DOCUMENT_INGESTION_QUEUE,
  handleDocumentIngestionJob
} from "@/lib/ai/ingestion-queue";
import { logger } from "@/lib/logger";
import { getRedis } from "@/lib/redis";

export function startDocumentIngestionWorker() {
  const redis = getRedis();
  if (!redis) {
    logger.warn("ai.document.worker_disabled_no_redis");
    return null;
  }

  const worker = new Worker(DOCUMENT_INGESTION_QUEUE, handleDocumentIngestionJob, {
    connection: redis,
    concurrency: 2
  });

  worker.on("completed", (job) => {
    logger.info({ jobId: job.id }, "ai.document.worker_completed");
  });

  worker.on("failed", (job, error) => {
    logger.error({ err: error, jobId: job?.id }, "ai.document.worker_failed");
  });

  return worker;
}
