import { MessageChannel, Prisma, SalesThreadStatus, StaffRole } from "@prisma/client";

import { isE164, normalizeZaPhone } from "@/lib/phone";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/staff";
import { ACTIVE_FOLLOW_UP_STATUSES, cancelActiveFollowUps, scheduleFollowUp } from "@/server/services/follow-up.service";
import { recordStaffAuditLog } from "@/server/services/staff-audit.service";

const TX_OPTIONS = { maxWait: 5_000, timeout: 15_000 };
const DEFAULT_STAGE_KEY = "ENQUIRY";

function normalizeContactPhone(phone: string) {
  const normalized = normalizeZaPhone(phone) ?? phone.trim();
  if (!isE164(normalized)) {
    throw new Error("Contact phone must be a valid E.164 phone number.");
  }
  return normalized;
}

function followUpDueAt(hours: number | null | undefined, now = new Date()) {
  if (!hours || hours <= 0) return null;
  return new Date(now.getTime() + hours * 60 * 60 * 1000);
}

async function getStageByKey(businessId: string, key: string) {
  return prisma.pipelineStage.findUniqueOrThrow({
    where: { businessId_key: { businessId, key } }
  });
}

async function nextNonTerminalStage(input: { businessId: string; order: number }) {
  return prisma.pipelineStage.findFirst({
    where: {
      businessId: input.businessId,
      order: { gt: input.order },
      isTerminal: false
    },
    orderBy: { order: "asc" }
  });
}

export async function createSalesThread(input: {
  businessId: string;
  actorUserId: string;
  contactPhone?: string | null;
  membershipId?: string | null;
  title: string;
  stageKey?: string | null;
  preferredChannel?: MessageChannel | null;
  valueZar?: string | number | null;
}) {
  await requireRole({ businessId: input.businessId, userId: input.actorUserId, allowedRoles: [StaffRole.STAFF] });

  const title = input.title.trim();
  if (!title) throw new Error("Sales thread title is required.");

  const membership = input.membershipId
    ? await prisma.membership.findFirst({
        where: { id: input.membershipId, businessId: input.businessId, isActive: true },
        include: { user: { select: { id: true, phone: true } } }
      })
    : null;

  const contactPhone = membership?.user.phone ?? (input.contactPhone ? normalizeContactPhone(input.contactPhone) : null);
  if (!contactPhone) {
    throw new Error("A contact phone or linked membership is required.");
  }

  const stage = await getStageByKey(input.businessId, input.stageKey || DEFAULT_STAGE_KEY);
  const dueAt = followUpDueAt(stage.defaultFollowUpHours);

  return prisma.$transaction(async (tx) => {
    const thread = await tx.salesThread.create({
      data: {
        businessId: input.businessId,
        membershipId: membership?.id ?? null,
        userId: membership?.userId ?? null,
        contactPhone,
        title,
        stageId: stage.id,
        preferredChannel: input.preferredChannel ?? null,
        valueZar: input.valueZar != null && input.valueZar !== "" ? new Prisma.Decimal(input.valueZar) : null,
        createdByUserId: input.actorUserId,
        nextFollowUpAt: dueAt
      },
      include: { stage: true, membership: { include: { user: true } } }
    });

    await recordStaffAuditLog({
      businessId: input.businessId,
      actorUserId: input.actorUserId,
      action: "sales.thread.create",
      targetType: "SalesThread",
      targetId: thread.id,
      metadata: { stageKey: stage.key, preferredChannel: input.preferredChannel ?? null }
    }, tx);

    return thread;
  }, TX_OPTIONS);
}

export async function advanceStage(input: {
  businessId: string;
  threadId: string;
  actorUserId: string;
  toStageKey: string;
}) {
  await requireRole({ businessId: input.businessId, userId: input.actorUserId, allowedRoles: [StaffRole.STAFF] });
  const stage = await getStageByKey(input.businessId, input.toStageKey);
  const dueAt = followUpDueAt(stage.defaultFollowUpHours);

  const thread = await prisma.$transaction(async (tx) => {
    const updated = await tx.salesThread.update({
      where: { id: input.threadId, businessId: input.businessId },
      data: {
        stageId: stage.id,
        status: stage.key === "WON" ? SalesThreadStatus.WON : stage.key === "LOST" ? SalesThreadStatus.LOST : SalesThreadStatus.OPEN,
        closedAt: stage.isTerminal ? new Date() : null,
        nextFollowUpAt: dueAt
      },
      include: { stage: true }
    });

    await recordStaffAuditLog({
      businessId: input.businessId,
      actorUserId: input.actorUserId,
      action: "sales.thread.advance",
      targetType: "SalesThread",
      targetId: input.threadId,
      metadata: { toStageKey: stage.key }
    }, tx);

    return updated;
  }, TX_OPTIONS);

  await cancelActiveFollowUps({ businessId: input.businessId, threadId: input.threadId, reason: "stage_advanced" });
  if (dueAt && thread.status === SalesThreadStatus.OPEN) {
    await scheduleFollowUp({
      businessId: input.businessId,
      threadId: input.threadId,
      stageId: stage.id,
      channel: thread.preferredChannel ?? MessageChannel.WHATSAPP,
      dueAt,
      reason: "stage_cadence"
    });
  }

  return thread;
}

export async function setThreadStatus(input: {
  businessId: string;
  threadId: string;
  actorUserId: string;
  status: SalesThreadStatus;
}) {
  await requireRole({ businessId: input.businessId, userId: input.actorUserId, allowedRoles: [StaffRole.STAFF] });
  const closed = input.status === SalesThreadStatus.WON || input.status === SalesThreadStatus.LOST || input.status === SalesThreadStatus.ARCHIVED;
  const thread = await prisma.$transaction(async (tx) => {
    const updated = await tx.salesThread.update({
      where: { id: input.threadId, businessId: input.businessId },
      data: { status: input.status, closedAt: closed ? new Date() : null, nextFollowUpAt: closed ? null : undefined }
    });
    await recordStaffAuditLog({
      businessId: input.businessId,
      actorUserId: input.actorUserId,
      action: "sales.thread.status",
      targetType: "SalesThread",
      targetId: input.threadId,
      metadata: { status: input.status }
    }, tx);
    return updated;
  }, TX_OPTIONS);
  if (closed) {
    await cancelActiveFollowUps({ businessId: input.businessId, threadId: input.threadId, reason: "thread_closed" });
  }
  return thread;
}

export async function markCustomerResponded(input: {
  businessId: string;
  threadId?: string | null;
  contactPhone?: string | null;
  messageId?: string | null;
  at?: Date;
}) {
  const at = input.at ?? new Date();
  const thread = await prisma.salesThread.findFirst({
    where: {
      businessId: input.businessId,
      status: SalesThreadStatus.OPEN,
      ...(input.threadId ? { id: input.threadId } : { contactPhone: input.contactPhone ?? undefined })
    },
    include: { stage: true },
    orderBy: { updatedAt: "desc" }
  });

  if (!thread) return null;

  await cancelActiveFollowUps({ businessId: input.businessId, threadId: thread.id, reason: "customer_responded" });

  const nextStage = thread.stage.autoAdvanceOnReply
    ? await nextNonTerminalStage({ businessId: input.businessId, order: thread.stage.order })
    : null;

  const updated = await prisma.salesThread.update({
    where: { id: thread.id },
    data: {
      lastCustomerReplyAt: at,
      nextFollowUpAt: null,
      ...(nextStage ? { stageId: nextStage.id } : {})
    },
    include: { stage: true }
  });

  if (input.messageId) {
    await prisma.message.updateMany({
      where: { id: input.messageId, businessId: input.businessId, salesThreadId: null },
      data: { salesThreadId: thread.id }
    });
  }

  return updated;
}

export async function listThreads(input: { businessId: string; stageId?: string | null; status?: SalesThreadStatus | null }) {
  return prisma.salesThread.findMany({
    where: {
      businessId: input.businessId,
      stageId: input.stageId ?? undefined,
      status: input.status ?? undefined
    },
    include: {
      stage: true,
      membership: { include: { user: { select: { id: true, name: true, phone: true, email: true } } } },
      followUpTasks: {
        where: { status: { in: ACTIVE_FOLLOW_UP_STATUSES } },
        orderBy: { dueAt: "asc" },
        take: 1
      }
    },
    orderBy: { updatedAt: "desc" }
  });
}

export async function getThreadDetail(input: { businessId: string; threadId: string }) {
  return prisma.salesThread.findFirstOrThrow({
    where: { id: input.threadId, businessId: input.businessId },
    include: {
      stage: true,
      documents: { orderBy: { createdAt: "desc" } },
      membership: { include: { user: { select: { id: true, name: true, phone: true, email: true } }, tier: true } },
      messages: { include: { attachments: true }, orderBy: { createdAt: "asc" }, take: 200 },
      followUpTasks: { orderBy: { createdAt: "desc" }, take: 10 }
    }
  });
}

export async function listPipelineStages(businessId: string) {
  return prisma.pipelineStage.findMany({ where: { businessId }, orderBy: { order: "asc" } });
}
