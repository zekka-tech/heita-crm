import { Job, Queue, type ConnectionOptions } from "bullmq";

import { logger } from "@/lib/logger";
import { getQueueRedis } from "@/lib/redis";
import { draftFollowUp } from "@/server/services/follow-up.service";

export const FOLLOW_UP_QUEUE = "follow-up";
export const FOLLOW_UP_DLQ = "follow-up-dlq";

export type FollowUpJob = {
  taskId: string;
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  var __heitaFollowUpQueue__: Queue<FollowUpJob, any, string, any, any, any> | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  var __heitaFollowUpDlq__: Queue<any, any, string, any, any, any> | undefined;
}

export function getFollowUpQueue() {
  const redis = getQueueRedis();
  if (!redis) return null;

  if (!global.__heitaFollowUpQueue__) {
    global.__heitaFollowUpQueue__ = new Queue<FollowUpJob>(FOLLOW_UP_QUEUE, {
      connection: redis as unknown as ConnectionOptions,
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 500,
        attempts: 3,
        backoff: { type: "exponential", delay: 2_000 }
      }
    });
  }

  return global.__heitaFollowUpQueue__;
}

export function getFollowUpDlq() {
  const redis = getQueueRedis();
  if (!redis) return null;

  if (!global.__heitaFollowUpDlq__) {
    global.__heitaFollowUpDlq__ = new Queue(FOLLOW_UP_DLQ, {
      connection: redis as unknown as ConnectionOptions,
      defaultJobOptions: { removeOnComplete: 100, removeOnFail: false }
    });
  }

  return global.__heitaFollowUpDlq__;
}

export async function enqueueFollowUpJob(input: { taskId: string }, options?: { delay?: number; jobId?: string }) {
  const queue = getFollowUpQueue();
  if (!queue || process.env.FOLLOWUP_INLINE === "1") {
    const result = await draftFollowUp(input.taskId);
    return { enqueued: false, mode: "inline" as const, taskId: input.taskId, result };
  }

  const job = await queue.add("draft-follow-up", input, {
    jobId: options?.jobId ?? "followup:" + input.taskId,
    delay: Math.max(0, options?.delay ?? 0)
  });

  return { enqueued: true, mode: "queue" as const, taskId: input.taskId, jobId: job.id };
}

export async function removeFollowUpJob(jobId: string | null | undefined) {
  if (!jobId) return false;
  const queue = getFollowUpQueue();
  if (!queue) return false;
  const job = await queue.getJob(jobId);
  if (!job) return false;
  await job.remove();
  return true;
}

export async function handleFollowUpJob(job: Job<FollowUpJob>) {
  logger.info({ jobId: job.id, taskId: job.data.taskId }, "followup.job_start");
  return draftFollowUp(job.data.taskId);
}

export async function moveFollowUpJobToDlq(job: Job<FollowUpJob>, err: Error) {
  const dlq = getFollowUpDlq();
  if (!dlq) return;
  await dlq.add("failed-job", {
    jobId: job.id,
    data: job.data,
    error: err.message
  });
  logger.error({ jobId: job.id, err }, "followup.job.moved_to_dlq");
}
