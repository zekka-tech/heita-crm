import { BusinessPlanId, FollowUpStatus, MessageChannel, SalesThreadStatus } from "@prisma/client";
import { NextResponse } from "next/server";

import { enqueueFollowUpJob } from "@/lib/follow-up-queue";
import { logger } from "@/lib/logger";
import { prisma, withBusinessScope } from "@/lib/prisma";
import { getRedis } from "@/lib/redis";
import { constantTimeEqual } from "@/lib/security";

export const dynamic = "force-dynamic";

const MAX_PER_RUN = 50;
const PAID_PLAN_IDS: BusinessPlanId[] = [
  BusinessPlanId.STARTER,
  BusinessPlanId.GROWTH,
  BusinessPlanId.SCALE
];
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
  const businesses = await prisma.business.findMany({
    where: {
      deletedAt: null,
      isActive: true,
      planId: { in: PAID_PLAN_IDS }
    },
    select: { id: true },
    take: 500
  });

  const threads: Array<{
    id: string;
    businessId: string;
    stageId: string;
    preferredChannel: MessageChannel | null;
    nextFollowUpAt: Date | null;
  }> = [];

  for (const business of businesses) {
    const businessThreads = await withBusinessScope(business.id, (tx) =>
      tx.salesThread.findMany({
        where: {
          businessId: business.id,
          status: SalesThreadStatus.OPEN,
          nextFollowUpAt: { lte: now },
          followUpTasks: { none: { status: { in: ACTIVE_STATUSES } } }
        },
        select: {
          id: true,
          businessId: true,
          stageId: true,
          preferredChannel: true,
          nextFollowUpAt: true
        },
        orderBy: { nextFollowUpAt: "asc" },
        take: MAX_PER_RUN
      })
    );
    threads.push(...businessThreads);
  }

  threads.sort((a, b) => {
    const aTime = a.nextFollowUpAt?.getTime() ?? 0;
    const bTime = b.nextFollowUpAt?.getTime() ?? 0;
    return aTime - bTime;
  });

  let enqueued = 0;
  for (const thread of threads.slice(0, MAX_PER_RUN)) {
    try {
      const task = await withBusinessScope(thread.businessId, (tx) =>
        tx.followUpTask.create({
          data: {
            businessId: thread.businessId,
            salesThreadId: thread.id,
            stageId: thread.stageId,
            channel: thread.preferredChannel ?? MessageChannel.WHATSAPP,
            dueAt: now,
            reason: "cron_sweep"
          }
        })
      );
      const job = await enqueueFollowUpJob({ taskId: task.id, businessId: thread.businessId }, { delay: 0, jobId: "followup:" + task.id });
      if (job.enqueued) {
        await withBusinessScope(thread.businessId, (tx) =>
          tx.followUpTask.update({ where: { id: task.id }, data: { bullJobId: job.jobId ?? null } })
        );
      }
      enqueued += 1;
    } catch (error) {
      logger.error({ err: error, salesThreadId: thread.id, businessId: thread.businessId }, "cron.sweep_followups.enqueue_failed");
    }
  }

  logger.info({ due: threads.length, enqueued }, "cron.sweep_followups.completed");
  return NextResponse.json({ ok: true, due: threads.length, enqueued });
}
