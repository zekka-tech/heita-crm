import { Worker } from "bullmq";

import {
  DOCUMENT_INGESTION_QUEUE,
  handleDocumentIngestionJob,
  moveIngestionJobToDlq
} from "@/lib/ai/ingestion-queue";
import { logger } from "@/lib/logger";
import { incrementDlqMovedCounter, incrementQueueJobMetric } from "@/lib/metrics";
import { getQueueRedis } from "@/lib/redis";

export function startDocumentIngestionWorker() {
  const redis = getQueueRedis();
  if (!redis) {
    logger.warn("ai.document.worker_disabled_no_redis");
    return null;
  }

  const worker = new Worker(DOCUMENT_INGESTION_QUEUE, handleDocumentIngestionJob, {
    connection: redis,
    concurrency: 2,
    stalledInterval: 30_000,
    maxStalledCount: 2,
    // Lock expires after 5 min without renewal; combined with maxStalledCount=2
    // this limits total hung-job wall time to ~10 min before the job is failed.
    lockDuration: 5 * 60 * 1000
  });

  worker.on("completed", (job) => {
    logger.info({ jobId: job.id }, "ai.document.worker_completed");
    incrementQueueJobMetric("document-ingestion", "completed");
  });

  worker.on("failed", (job, error) => {
    logger.error({ err: error, jobId: job?.id }, "ai.document.worker_failed");
    incrementQueueJobMetric("document-ingestion", "failed");
    if (job && job.attemptsMade >= (job.opts.attempts ?? 3)) {
      void moveIngestionJobToDlq(job, error).catch((dlqErr) => {
        logger.error({ err: dlqErr, jobId: job.id }, "ingestion.dlq.move_failed");
      });
    }
  });

  worker.on("stalled", (jobId) => {
    logger.error({ jobId }, "ai.document.worker.job_stalled");
    incrementDlqMovedCounter("document-ingestion");
  });

  return worker;
}
