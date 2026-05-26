import { Job, Queue, Worker } from "bullmq";

import { logger } from "@/lib/logger";
import { getQueueRedis } from "@/lib/redis";
import { processCustomerImportRun } from "@/server/services/customer-import.service";

export const CUSTOMER_IMPORT_QUEUE = "customer-import";

type CustomerImportJob = {
  importRunId: string;
};

declare global {
  var __heitaCustomerImportQueue__: Queue<CustomerImportJob> | undefined;
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

export function startCustomerImportWorker() {
  const redis = getQueueRedis();
  if (!redis) {
    return null;
  }

  return new Worker<CustomerImportJob>(
    CUSTOMER_IMPORT_QUEUE,
    handleCustomerImportJob,
    {
      connection: redis,
      concurrency: 1
    }
  );
}
