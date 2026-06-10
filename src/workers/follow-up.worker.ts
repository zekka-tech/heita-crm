import { Worker, type ConnectionOptions } from "bullmq";

import { FOLLOW_UP_QUEUE, handleFollowUpJob, moveFollowUpJobToDlq, type FollowUpJob } from "@/lib/follow-up-queue";
import { logger } from "@/lib/logger";
import { incrementQueueJobMetric } from "@/lib/metrics";
import { getQueueRedis } from "@/lib/redis";

export function startFollowUpWorker() {
  const redis = getQueueRedis();
  if (!redis) return null;

  const worker = new Worker<FollowUpJob>(FOLLOW_UP_QUEUE, handleFollowUpJob, {
    connection: redis as unknown as ConnectionOptions,
    concurrency: 5,
    lockDuration: 2 * 60 * 1000,
    stalledInterval: 30_000,
    maxStalledCount: 2
  });

  worker.on("completed", () => {
    incrementQueueJobMetric("follow-up", "completed");
  });

  worker.on("failed", (job, error) => {
    incrementQueueJobMetric("follow-up", "failed");
    if (job && job.attemptsMade >= (job.opts.attempts ?? 3)) {
      void moveFollowUpJobToDlq(job, error).catch((dlqErr) => {
        logger.error({ err: dlqErr, jobId: job.id }, "followup.dlq.move_failed");
      });
    }
  });

  worker.on("stalled", (jobId) => {
    logger.error({ jobId }, "followup.worker.job_stalled");
    incrementQueueJobMetric("follow-up", "stalled");
  });

  return worker;
}
