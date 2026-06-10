import { FollowUpStatus, MessageChannel, SalesThreadStatus } from "@prisma/client";
import { NextResponse } from "next/server";

import { enqueueFollowUpJob } from "@/lib/follow-up-queue";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { getRedis } from "@/lib/redis";
import { constantTimeEqual } from "@/lib/security";

export const dynamic = "force-dynamic";

const MAX_PER_RUN = 50;
const ACTIVE_STATUSES = [
  FollowUpStatus.SCHEDULED,
  FollowUpStatus.DRAFTING,
  FollowUpStatus.AWAITING_APPROVAL,
  FollowUpStatus.APPROVED
];

function isAuthorized(request: Request): boolean {
  const provided = request.headers.get("x-cron-secret") ?? request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const expected = process.env.CRON_SECRET;
  if (!provided || !expected) return false;
  return constantTimeEqual(provided, expected);
}

async function checkIdempotency() {
  const redis = getRedis();
  if (!redis) return true;
  const key = "cron:sweep-follow-ups:" + new Date().toISOString().slice(0, 13);
  const result = await redis.set(key, "1", "EX", 60 * 60, "NX");
  return result === "OK";
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!(await checkIdempotency())) {
    return NextResponse.json({ ok: true, skipped: true, reason: "idempotent" });
  }

  const now = new Date();
  const threads = await prisma.salesThread.findMany({
    where: {
      status: SalesThreadStatus.OPEN,
      nextFollowUpAt: { lte: now },
      followUpTasks: { none: { status: { in: ACTIVE_STATUSES } } }
    },
    include: { stage: true },
    orderBy: { nextFollowUpAt: "asc" },
    take: MAX_PER_RUN
  });

  let enqueued = 0;
  for (const thread of threads) {
    try {
      const task = await prisma.followUpTask.create({
        data: {
          businessId: thread.businessId,
          salesThreadId: thread.id,
          stageId: thread.stageId,
          channel: thread.preferredChannel ?? MessageChannel.WHATSAPP,
          dueAt: now,
          reason: "cron_sweep"
        }
      });
      const job = await enqueueFollowUpJob({ taskId: task.id }, { delay: 0, jobId: "followup:" + task.id });
      if (job.enqueued) {
        await prisma.followUpTask.update({ where: { id: task.id }, data: { bullJobId: job.jobId ?? null } });
      }
      enqueued += 1;
    } catch (error) {
      logger.error({ err: error, salesThreadId: thread.id }, "cron.sweep_followups.enqueue_failed");
    }
  }

  logger.info({ due: threads.length, enqueued }, "cron.sweep_followups.completed");
  return NextResponse.json({ ok: true, due: threads.length, enqueued });
}
