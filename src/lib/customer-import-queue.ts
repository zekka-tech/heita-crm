import { Job, Queue, Worker } from "bullmq";

import { logger } from "@/lib/logger";
import { incrementDlqMovedCounter, incrementQueueJobMetric } from "@/lib/metrics";
import { getQueueRedis } from "@/lib/redis";
import { processCustomerImportRun } from "@/server/services/customer-import.service";

export const CUSTOMER_IMPORT_QUEUE = "customer-import";
export const CUSTOMER_IMPORT_DLQ = "customer-import-dlq";

type CustomerImportJob = {
  importRunId: string;
};

declare global {
  var __heitaCustomerImportQueue__: Queue<CustomerImportJob> | undefined;
  var __heitaCustomerImportDlq__: Queue | undefined;
}

export function getCustomerImportQueue() {
  const redis = getQueueRedis();
  if (!redis) {
    return null;
  }

  if (!global.__heitaCustomerImportQueue__) {
    global.__heitaCustomerImportQueue__ = new Queue<CustomerImportJob>(
      CUSTOMER_IMPORT_QUEUE,
      {
        connection: redis,
        defaultJobOptions: {
          removeOnComplete: 100,
          removeOnFail: 500,
          attempts: 3,
          backoff: {
            type: "exponential",
            delay: 1_000
          }
        }
      }
    );
  }

  return global.__heitaCustomerImportQueue__;
}

export function getCustomerImportDlq() {
  const redis = getQueueRedis();
  if (!redis) {
    return null;
  }

  if (!global.__heitaCustomerImportDlq__) {
    global.__heitaCustomerImportDlq__ = new Queue(CUSTOMER_IMPORT_DLQ, {
      connection: redis,
      defaultJobOptions: { removeOnComplete: 100, removeOnFail: false }
    });
  }

  return global.__heitaCustomerImportDlq__;
}

export async function enqueueCustomerImportRun(importRunId: string) {
  const queue = getCustomerImportQueue();
  if (!queue || process.env.CUSTOMER_IMPORT_INLINE === "1") {
    const result = await processCustomerImportRun(importRunId);
    return {
      enqueued: false,
      mode: "inline" as const,
      importRunId,
      result
    };
  }

  const job = await queue.add(
    "customer-import",
    { importRunId },
    {
      jobId: `customer-import:${importRunId}`
    }
  );

  return {
    enqueued: true,
    mode: "queue" as const,
    importRunId,
    jobId: job.id
  };
}

export async function handleCustomerImportJob(job: Job<CustomerImportJob>) {
  logger.info({ jobId: job.id, importRunId: job.data.importRunId }, "customer.import.job_start");
  return processCustomerImportRun(job.data.importRunId);
}

/**
 * Moves a permanently-failed customer-import job to the dead-letter queue.
 * Call this from the worker's "failed" event handler after all retries are exhausted.
 */
export async function moveCustomerImportJobToDlq(
  job: Job<CustomerImportJob>,
  err: Error
): Promise<void> {
  const dlq = getCustomerImportDlq();
  if (!dlq) return;

  await dlq.add("failed-job", {
    jobId: job.id,
    data: job.data,
    error: err.message
  });
  logger.error({ jobId: job.id, err }, "customer.import.job.moved_to_dlq");
}

export function startCustomerImportWorker() {
  const redis = getQueueRedis();
  if (!redis) {
    return null;
  }

  const worker = new Worker<CustomerImportJob>(
    CUSTOMER_IMPORT_QUEUE,
    handleCustomerImportJob,
    {
      connection: redis,
      concurrency: 1,
      lockDuration: 5 * 60 * 1000,
      stalledInterval: 30_000,
      maxStalledCount: 2
    }
  );

  worker.on("completed", () => {
    incrementQueueJobMetric("customer-import", "completed");
  });

  worker.on("failed", (job, error) => {
    incrementQueueJobMetric("customer-import", "failed");
    if (job && job.attemptsMade >= (job.opts.attempts ?? 3)) {
      void moveCustomerImportJobToDlq(job, error).catch((dlqErr) => {
        logger.error({ err: dlqErr, jobId: job.id }, "customer.import.dlq.move_failed");
      });
    }
  });

  worker.on("stalled", (jobId) => {
    logger.error({ jobId }, "customer.import.worker.job_stalled");
    incrementDlqMovedCounter("customer-import");
  });

  return worker;
}
