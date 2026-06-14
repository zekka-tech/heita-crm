import { Queue, Worker, type ConnectionOptions } from "bullmq";

import { logger } from "@/lib/logger";
import { incrementQueueJobMetric } from "@/lib/metrics";
import { getQueueRedis } from "@/lib/redis";
import { submitOcrReceipt } from "@/server/services/ocr-receipt.service";

export const RECEIPT_BATCH_QUEUE = "receipt-batch";
export const RECEIPT_BATCH_DLQ = "receipt-batch-dlq";

export type ReceiptBatchJob = {
  businessId: string;
  userId: string;
  imageUrl: string;
  rawText?: string | null;
  batchId: string;
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  var __heitaReceiptBatchQueue__: Queue<ReceiptBatchJob, any, string, any, any, any> | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  var __heitaReceiptBatchDlq__: Queue<any, any, string, any, any, any> | undefined;
}

export function getReceiptBatchQueue() {
  const redis = getQueueRedis();
  if (!redis) return null;

  if (!global.__heitaReceiptBatchQueue__) {
    global.__heitaReceiptBatchQueue__ = new Queue<ReceiptBatchJob>(RECEIPT_BATCH_QUEUE, {
      connection: redis as unknown as ConnectionOptions,
      defaultJobOptions: {
        removeOnComplete: 200,
        removeOnFail: 500,
        attempts: 3,
        backoff: { type: "exponential", delay: 2_000 }
      }
    });
  }
  return global.__heitaReceiptBatchQueue__;
}

export function getReceiptBatchDlq() {
  const redis = getQueueRedis();
  if (!redis) return null;

  if (!global.__heitaReceiptBatchDlq__) {
    global.__heitaReceiptBatchDlq__ = new Queue(RECEIPT_BATCH_DLQ, {
      connection: redis as unknown as ConnectionOptions,
      defaultJobOptions: { removeOnComplete: 100, removeOnFail: 1_000 }
    });
  }
  return global.__heitaReceiptBatchDlq__;
}

export function startReceiptBatchWorker() {
  const redis = getQueueRedis();
  if (!redis) {
    logger.warn("receipt-batch.worker.skip: Redis unavailable");
    return null;
  }

  const worker = new Worker<ReceiptBatchJob>(
    RECEIPT_BATCH_QUEUE,
    async (job) => {
      const { businessId, userId, imageUrl, rawText, batchId } = job.data;
      logger.info({ jobId: job.id, batchId, businessId, userId }, "receipt-batch.job.start");

      await submitOcrReceipt({ businessId, userId, imageUrl, clientRawText: rawText ?? null });

      incrementQueueJobMetric(RECEIPT_BATCH_QUEUE, "completed");
      logger.info({ jobId: job.id, batchId }, "receipt-batch.job.done");
    },
    {
      connection: redis as unknown as ConnectionOptions,
      concurrency: 3,
      limiter: { max: 10, duration: 60_000 }
    }
  );

  worker.on("failed", (job, err) => {
    incrementQueueJobMetric(RECEIPT_BATCH_QUEUE, "failed");
    logger.error({ jobId: job?.id, err }, "receipt-batch.job.failed");

    if ((job?.attemptsMade ?? 0) >= (job?.opts?.attempts ?? 3)) {
      const dlq = getReceiptBatchDlq();
      if (dlq && job?.data) {
        dlq
          .add("dead", { ...job.data, failedReason: String(err.message) })
          .catch(() => undefined);
      }
    }
  });

  logger.info("receipt-batch.worker.started");
  return worker;
}
