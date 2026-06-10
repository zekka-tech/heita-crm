import { FollowUpStatus, MessageChannel, SalesThreadStatus, StaffRole } from "@prisma/client";

import { generateFollowUpDraft } from "@/lib/ai/follow-up-drafter";
import { enqueueFollowUpJob, removeFollowUpJob } from "@/lib/follow-up-queue";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/staff";
import { requirePaidBusinessPlan, isPaidBusinessPlan, getEffectivePlan } from "@/server/services/billing.service";
import { sendOnChannel } from "@/server/services/channel-dispatch.service";
import { sendNotification } from "@/server/services/notification.service";
import { recordStaffAuditLog } from "@/server/services/staff-audit.service";

const TX_OPTIONS = { maxWait: 5_000, timeout: 15_000 };
export const ACTIVE_FOLLOW_UP_STATUSES: FollowUpStatus[] = [
  FollowUpStatus.SCHEDULED,
  FollowUpStatus.DRAFTING,
  FollowUpStatus.AWAITING_APPROVAL,
  FollowUpStatus.APPROVED
];

function delayUntil(dueAt: Date) {
  return Math.max(0, dueAt.getTime() - Date.now());
}

export async function scheduleFollowUp(input: {
  businessId: string;
  threadId: string;
  stageId: string;
  channel: MessageChannel;
  dueAt: Date;
  reason: string;
}) {
  await requirePaidBusinessPlan(input.businessId, "Sales follow-ups");
  const task = await prisma.$transaction(async (tx) => {
    const existing = await tx.followUpTask.findFirst({
      where: {
        businessId: input.businessId,
        salesThreadId: input.threadId,
        status: { in: ACTIVE_FOLLOW_UP_STATUSES }
      },
      orderBy: { createdAt: "desc" }
    });

    if (existing) {
      await removeFollowUpJob(existing.bullJobId);
      return tx.followUpTask.update({
        where: { id: existing.id },
        data: {
          stageId: input.stageId,
          channel: input.channel,
          dueAt: input.dueAt,
          reason: input.reason,
          status: FollowUpStatus.SCHEDULED,
          aiDraftBody: null,
          approvedBody: null,
          approvedByUserId: null,
          sentMessageId: null,
          attempts: 0,
          bullJobId: null
        }
      });
    }

    return tx.followUpTask.create({
      data: {
        businessId: input.businessId,
        salesThreadId: input.threadId,
        stageId: input.stageId,
        channel: input.channel,
        dueAt: input.dueAt,
        reason: input.reason
      }
    });
  }, TX_OPTIONS);

  const job = await enqueueFollowUpJob(
    { taskId: task.id },
    { delay: delayUntil(input.dueAt), jobId: "followup:" + task.id }
  );

  if (job.enqueued) {
    await prisma.followUpTask.updateMany({
      where: { id: task.id, businessId: input.businessId },
      data: { bullJobId: job.jobId ?? null }
    });
  }

  return task;
}

export async function cancelActiveFollowUps(input: {
  businessId: string;
  threadId: string;
  reason: string;
}) {
  const tasks = await prisma.followUpTask.findMany({
    where: {
      businessId: input.businessId,
      salesThreadId: input.threadId,
      status: { in: ACTIVE_FOLLOW_UP_STATUSES }
    },
    select: { id: true, bullJobId: true }
  });

  await Promise.all(tasks.map((task) => removeFollowUpJob(task.bullJobId).catch(() => false)));

  if (tasks.length) {
    await prisma.followUpTask.updateMany({
      where: { id: { in: tasks.map((task) => task.id) }, businessId: input.businessId },
      data: { status: FollowUpStatus.CANCELLED, reason: input.reason }
    });
  }

  return tasks.length;
}

export async function draftFollowUp(taskId: string) {
  const task = await prisma.followUpTask.findUnique({
    where: { id: taskId },
    include: {
      salesThread: {
        include: {
          stage: true,
          documents: { orderBy: { createdAt: "desc" }, take: 1 }
        }
      }
    }
  });

  if (!task || (task.status !== FollowUpStatus.SCHEDULED && task.status !== FollowUpStatus.DRAFTING)) {
    return { skipped: true, reason: "not_scheduled" };
  }

  if (!isPaidBusinessPlan(await getEffectivePlan(task.businessId))) {
    await prisma.followUpTask.update({
      where: { id: task.id },
      data: { status: FollowUpStatus.SKIPPED, reason: "paid_plan_required" }
    });
    return { skipped: true, reason: "paid_plan_required" };
  }

  if (task.salesThread.status !== SalesThreadStatus.OPEN) {
    await prisma.followUpTask.update({
      where: { id: task.id },
      data: { status: FollowUpStatus.SKIPPED, reason: "thread_not_open" }
    });
    return { skipped: true, reason: "thread_not_open" };
  }

  await prisma.followUpTask.update({
    where: { id: task.id },
    data: { status: FollowUpStatus.DRAFTING, attempts: { increment: 1 } }
  });

  try {
    const draft = await generateFollowUpDraft({
      businessId: task.businessId,
      threadId: task.salesThreadId,
      channel: task.channel
    });

    const updated = await prisma.followUpTask.update({
      where: { id: task.id },
      data: {
        status: FollowUpStatus.AWAITING_APPROVAL,
        aiDraftBody: draft.body,
        reason: task.reason
      },
      include: { salesThread: true }
    });

    if (updated.salesThread.createdByUserId) {
      await sendNotification({
        userId: updated.salesThread.createdByUserId,
        businessId: updated.businessId,
        title: "Follow-up ready to review",
        body: updated.salesThread.title,
        type: "sales_followup_review",
        actionUrl: "/dashboard/" + updated.businessId + "/sales/" + updated.salesThreadId
      });
    }

    await recordStaffAuditLog({
      businessId: task.businessId,
      actorUserId: null,
      action: "sales.followup.draft",
      targetType: "FollowUpTask",
      targetId: task.id,
      metadata: { runtime: draft.runtime, model: draft.model }
    });

    return { drafted: true, taskId: task.id };
  } catch (error) {
    logger.error({ err: error, taskId: task.id }, "sales.followup.draft_failed");
    await prisma.followUpTask.update({
      where: { id: task.id },
      data: { status: FollowUpStatus.FAILED, reason: "draft_failed" }
    });
    throw error;
  }
}

export async function approveAndSendFollowUp(input: {
  businessId: string;
  taskId: string;
  actorUserId: string;
  editedBody?: string | null;
}) {
  await requireRole({
    businessId: input.businessId,
    userId: input.actorUserId,
    allowedRoles: [StaffRole.STAFF]
  });
  await requirePaidBusinessPlan(input.businessId, "Sales follow-ups");

  const task = await prisma.followUpTask.findFirstOrThrow({
    where: {
      id: input.taskId,
      businessId: input.businessId,
      status: FollowUpStatus.AWAITING_APPROVAL
    },
    include: {
      salesThread: true
    }
  });

  const body = (input.editedBody?.trim() || task.aiDraftBody || "").trim();
  if (!body) throw new Error("Follow-up body is required.");

  const claim = await prisma.followUpTask.updateMany({
    where: {
      id: input.taskId,
      businessId: input.businessId,
      status: FollowUpStatus.AWAITING_APPROVAL
    },
    data: {
      status: FollowUpStatus.APPROVED,
      approvedByUserId: input.actorUserId,
      approvedBody: body
    }
  });

  if (claim.count === 0) {
    throw new Error("This follow-up has already been claimed or sent.");
  }

  let result;
  try {
    result = await sendOnChannel({
      businessId: input.businessId,
      thread: task.salesThread,
      channel: task.channel,
      body
    });
  } catch (error) {
    await prisma.followUpTask.updateMany({
      where: {
        id: task.id,
        businessId: input.businessId,
        status: FollowUpStatus.APPROVED
      },
      data: {
        status: FollowUpStatus.AWAITING_APPROVAL,
        approvedByUserId: null,
        approvedBody: null
      }
    });
    throw error;
  }

  const updated = await prisma.$transaction(async (tx) => {
    await tx.followUpTask.updateMany({
      where: {
        id: task.id,
        businessId: input.businessId,
        status: FollowUpStatus.APPROVED
      },
      data: {
        status: FollowUpStatus.SENT,
        approvedBody: body,
        approvedByUserId: input.actorUserId,
        sentMessageId: result.messageId
      }
    });
    const row = await tx.followUpTask.findUniqueOrThrow({
      where: { id: task.id }
    });
    await tx.salesThread.update({
      where: { id: task.salesThreadId },
      data: { lastOutboundAt: new Date(), nextFollowUpAt: null }
    });
    await recordStaffAuditLog({
      businessId: input.businessId,
      actorUserId: input.actorUserId,
      action: "sales.followup.approve_send",
      targetType: "FollowUpTask",
      targetId: task.id,
      metadata: { channel: task.channel, sentMessageId: result.messageId }
    }, tx);
    return row;
  }, TX_OPTIONS);

  return updated;
}

export async function snoozeFollowUp(input: { businessId: string; taskId: string; actorUserId: string; dueAt: Date }) {
  await requireRole({ businessId: input.businessId, userId: input.actorUserId, allowedRoles: [StaffRole.STAFF] });
  await requirePaidBusinessPlan(input.businessId, "Sales follow-ups");
  const task = await prisma.followUpTask.findFirstOrThrow({ where: { id: input.taskId, businessId: input.businessId } });
  await removeFollowUpJob(task.bullJobId);
  const updated = await prisma.followUpTask.update({
    where: { id: task.id },
    data: { status: FollowUpStatus.SCHEDULED, dueAt: input.dueAt, bullJobId: null }
  });
  const job = await enqueueFollowUpJob({ taskId: task.id }, { delay: delayUntil(input.dueAt), jobId: "followup:" + task.id });
  if (job.enqueued) {
    await prisma.followUpTask.update({ where: { id: task.id }, data: { bullJobId: job.jobId ?? null } });
  }
  return updated;
}

export async function skipFollowUp(input: { businessId: string; taskId: string; actorUserId: string }) {
  await requireRole({ businessId: input.businessId, userId: input.actorUserId, allowedRoles: [StaffRole.STAFF] });
  await requirePaidBusinessPlan(input.businessId, "Sales follow-ups");
  const task = await prisma.followUpTask.findFirstOrThrow({ where: { id: input.taskId, businessId: input.businessId } });
  await removeFollowUpJob(task.bullJobId);
  return prisma.followUpTask.update({ where: { id: task.id }, data: { status: FollowUpStatus.SKIPPED, reason: "staff_skipped" } });
}
