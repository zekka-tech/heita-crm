import { Worker, type ConnectionOptions } from "bullmq";

import {
  WEB_CRAWL_QUEUE,
  handleWebCrawlJob,
  moveWebCrawlJobToDlq
} from "@/lib/ai/web-crawl-queue";
import { logger } from "@/lib/logger";
import { incrementQueueJobMetric } from "@/lib/metrics";
import { getQueueRedis } from "@/lib/redis";

export function startWebCrawlWorker() {
  const redis = getQueueRedis();
  if (!redis) {
    logger.warn("crawler.worker_disabled_no_redis");
    return null;
  }

  const worker = new Worker(WEB_CRAWL_QUEUE, handleWebCrawlJob, {
    connection: redis as unknown as ConnectionOptions,
    // Crawls are network-heavy and long; keep concurrency low.
    concurrency: 1,
    stalledInterval: 30_000,
    maxStalledCount: 2,
    // A full crawl (≤50 pages) plus per-page enqueue can run for minutes.
    lockDuration: 10 * 60 * 1000
  });

  worker.on("completed", (job) => {
    logger.info({ jobId: job.id }, "crawler.worker_completed");
    incrementQueueJobMetric("web-crawl", "completed");
  });

  worker.on("failed", (job, error) => {
    logger.error({ err: error, jobId: job?.id }, "crawler.worker_failed");
    incrementQueueJobMetric("web-crawl", "failed");
    if (job && job.attemptsMade >= (job.opts.attempts ?? 3)) {
      void moveWebCrawlJobToDlq(job, error).catch((dlqErr) => {
        logger.error({ err: dlqErr, jobId: job.id }, "crawler.dlq.move_failed");
      });
    }
  });

  worker.on("stalled", (jobId) => {
    logger.error({ jobId }, "crawler.worker.job_stalled");
    incrementQueueJobMetric("web-crawl", "stalled");
  });

  return worker;
}
