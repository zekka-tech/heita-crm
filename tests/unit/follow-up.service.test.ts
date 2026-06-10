import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {
    $transaction: vi.fn(),
    followUpTask: {
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      findFirstOrThrow: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      findMany: vi.fn()
    },
    salesThread: { update: vi.fn() }
  },
  requireRole: vi.fn(),
  requirePaidBusinessPlan: vi.fn(),
  isPaidBusinessPlan: vi.fn(),
  getEffectivePlan: vi.fn(),
  sendOnChannel: vi.fn(),
  generateFollowUpDraft: vi.fn(),
  sendNotification: vi.fn(),
  recordStaffAuditLog: vi.fn(),
  removeFollowUpJob: vi.fn(),
  enqueueFollowUpJob: vi.fn()
}));

vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/staff", () => ({ requireRole: mocks.requireRole }));
vi.mock("@/server/services/billing.service", () => ({
  requirePaidBusinessPlan: mocks.requirePaidBusinessPlan,
  isPaidBusinessPlan: mocks.isPaidBusinessPlan,
  getEffectivePlan: mocks.getEffectivePlan
}));
vi.mock("@/server/services/channel-dispatch.service", () => ({ sendOnChannel: mocks.sendOnChannel }));
vi.mock("@/lib/ai/follow-up-drafter", () => ({ generateFollowUpDraft: mocks.generateFollowUpDraft }));
vi.mock("@/server/services/notification.service", () => ({ sendNotification: mocks.sendNotification }));
vi.mock("@/server/services/staff-audit.service", () => ({ recordStaffAuditLog: mocks.recordStaffAuditLog }));
vi.mock("@/lib/follow-up-queue", () => ({
  removeFollowUpJob: mocks.removeFollowUpJob,
  enqueueFollowUpJob: mocks.enqueueFollowUpJob
}));

const { approveAndSendFollowUp, draftFollowUp } = await import("@/server/services/follow-up.service");
const { FollowUpStatus, MessageChannel, SalesThreadStatus } = await import("@prisma/client");

const thread = {
  id: "thread_1",
  businessId: "biz_1",
  contactPhone: "+27821234567",
  userId: "user_1",
  title: "Quote follow-up"
};

const awaitingTask = {
  id: "task_1",
  businessId: "biz_1",
  salesThreadId: "thread_1",
  stageId: "stage_1",
  channel: MessageChannel.WHATSAPP,
  status: FollowUpStatus.AWAITING_APPROVAL,
  aiDraftBody: "Draft body",
  salesThread: thread
};

function scheduledTask(status: typeof FollowUpStatus.SCHEDULED | typeof FollowUpStatus.DRAFTING | typeof FollowUpStatus.AWAITING_APPROVAL) {
  return {
    id: "task_1",
    businessId: "biz_1",
    salesThreadId: "thread_1",
    stageId: "stage_1",
    channel: MessageChannel.WHATSAPP,
    status,
    reason: "document_sent",
    salesThread: {
      id: "thread_1",
      status: SalesThreadStatus.OPEN,
      createdByUserId: "staff_1",
      documents: [],
      stage: { id: "stage_1" }
    }
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireRole.mockResolvedValue({ role: "STAFF" });
  mocks.requirePaidBusinessPlan.mockResolvedValue("GROWTH");
  mocks.isPaidBusinessPlan.mockReturnValue(true);
  mocks.getEffectivePlan.mockResolvedValue("GROWTH");
  mocks.sendOnChannel.mockResolvedValue({ messageId: "msg_1" });
  mocks.recordStaffAuditLog.mockResolvedValue(undefined);
  mocks.sendNotification.mockResolvedValue({ id: "notification_1" });
  mocks.generateFollowUpDraft.mockResolvedValue({ body: "Generated draft", runtime: "fallback", model: null });
  mocks.prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn({
    followUpTask: {
      updateMany: mocks.prisma.followUpTask.updateMany,
      findUniqueOrThrow: mocks.prisma.followUpTask.findUniqueOrThrow
    },
    salesThread: mocks.prisma.salesThread
  }));
  mocks.prisma.followUpTask.findFirstOrThrow.mockResolvedValue(awaitingTask);
  mocks.prisma.followUpTask.updateMany.mockResolvedValue({ count: 1 });
  mocks.prisma.followUpTask.findUniqueOrThrow.mockResolvedValue({ ...awaitingTask, status: FollowUpStatus.SENT });
  mocks.prisma.salesThread.update.mockResolvedValue(thread);
});

describe("approveAndSendFollowUp", () => {
  it("claims the task before sending so concurrent approvals do not double-send", async () => {
    await approveAndSendFollowUp({
      businessId: "biz_1",
      taskId: "task_1",
      actorUserId: "staff_1",
      editedBody: "Approved body"
    });

    expect(mocks.prisma.followUpTask.updateMany).toHaveBeenNthCalledWith(1, expect.objectContaining({
      where: expect.objectContaining({ status: FollowUpStatus.AWAITING_APPROVAL }),
      data: expect.objectContaining({ status: FollowUpStatus.APPROVED })
    }));
    expect(mocks.sendOnChannel).toHaveBeenCalledOnce();
  });

  it("does not send when another approver already claimed the task", async () => {
    mocks.prisma.followUpTask.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(approveAndSendFollowUp({
      businessId: "biz_1",
      taskId: "task_1",
      actorUserId: "staff_1"
    })).rejects.toThrow(/already been claimed/);

    expect(mocks.sendOnChannel).not.toHaveBeenCalled();
  });

  it("reverts to awaiting approval when the channel send fails", async () => {
    mocks.sendOnChannel.mockRejectedValueOnce(new Error("provider down"));

    await expect(approveAndSendFollowUp({
      businessId: "biz_1",
      taskId: "task_1",
      actorUserId: "staff_1"
    })).rejects.toThrow(/provider down/);

    expect(mocks.prisma.followUpTask.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: FollowUpStatus.APPROVED }),
      data: expect.objectContaining({ status: FollowUpStatus.AWAITING_APPROVAL })
    }));
  });
});

describe("draftFollowUp", () => {
  it("allows BullMQ retry re-entry from DRAFTING", async () => {
    mocks.prisma.followUpTask.findUnique.mockResolvedValue(scheduledTask(FollowUpStatus.DRAFTING));
    mocks.prisma.followUpTask.update.mockImplementation(async (input: { include?: unknown }) => {
      if (input.include) {
        return { id: "task_1", salesThread: { ...thread, createdByUserId: "staff_1" } };
      }
      return { id: "task_1" };
    });

    await expect(draftFollowUp("task_1")).resolves.toEqual({ drafted: true, taskId: "task_1" });
    expect(mocks.generateFollowUpDraft).toHaveBeenCalledOnce();
  });

  it("skips drafts that are already awaiting approval", async () => {
    mocks.prisma.followUpTask.findUnique.mockResolvedValue(scheduledTask(FollowUpStatus.AWAITING_APPROVAL));

    await expect(draftFollowUp("task_1")).resolves.toEqual({ skipped: true, reason: "not_scheduled" });
    expect(mocks.generateFollowUpDraft).not.toHaveBeenCalled();
  });
});
