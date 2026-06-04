import { Job, Queue, type ConnectionOptions } from "bullmq";

import { logger } from "@/lib/logger";
import { getQueueRedis } from "@/lib/redis";
import { runWebSourceCrawl } from "@/lib/ai/web-source-crawl";

export const WEB_CRAWL_QUEUE = "web-crawl";
export const WEB_CRAWL_DLQ = "web-crawl-dlq";

type WebCrawlJob = {
  webSourceId: string;
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  var __heitaWebCrawlQueue__: Queue<WebCrawlJob, any, string, any, any, any> | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  var __heitaWebCrawlDlq__: Queue<any, any, string, any, any, any> | undefined;
}

export function getWebCrawlQueue() {
  const redis = getQueueRedis();
  if (!redis) {
    return null;
  }

  if (!global.__heitaWebCrawlQueue__) {
    global.__heitaWebCrawlQueue__ = new Queue<WebCrawlJob>(WEB_CRAWL_QUEUE, {
      connection: redis as unknown as ConnectionOptions,
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 500,
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 }
      }
    });
  }

  return global.__heitaWebCrawlQueue__;
}

export function getWebCrawlDlq() {
  const redis = getQueueRedis();
  if (!redis) {
    return null;
  }

  if (!global.__heitaWebCrawlDlq__) {
    global.__heitaWebCrawlDlq__ = new Queue(WEB_CRAWL_DLQ, {
      connection: redis as unknown as ConnectionOptions,
      defaultJobOptions: { removeOnComplete: 100, removeOnFail: false }
    });
  }

  return global.__heitaWebCrawlDlq__;
}

export async function enqueueWebCrawlJob(webSourceId: string) {
  const queue = getWebCrawlQueue();

  // No Redis (dev/test) or explicit inline mode → crawl synchronously.
  if (!queue || process.env.AI_INGEST_INLINE === "1") {
    const result = await runWebSourceCrawl(webSourceId);
    return { enqueued: false, mode: "inline" as const, webSourceId, result };
  }

  const job = await queue.add(
    "crawl-web-source",
    { webSourceId },
    { jobId: `web-source:${webSourceId}` }
  );

  return { enqueued: true, mode: "queue" as const, webSourceId, jobId: job.id };
}

export async function handleWebCrawlJob(job: Job<WebCrawlJob>) {
  logger.info({ jobId: job.id, webSourceId: job.data.webSourceId }, "crawler.job_start");
  return runWebSourceCrawl(job.data.webSourceId);
}

export async function moveWebCrawlJobToDlq(job: Job<WebCrawlJob>, err: Error): Promise<void> {
  const dlq = getWebCrawlDlq();
  if (!dlq) return;

  await dlq.add("failed-job", { jobId: job.id, data: job.data, error: err.message });
  logger.error({ jobId: job.id, err }, "crawler.job.moved_to_dlq");
}
