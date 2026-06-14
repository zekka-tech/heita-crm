import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { prisma, enqueueFollowUpJob, redis } = vi.hoisted(() => ({
  prisma: {
    salesThread: { findMany: vi.fn() },
    followUpTask: { create: vi.fn(), update: vi.fn() }
  },
  enqueueFollowUpJob: vi.fn(),
  redis: { set: vi.fn() }
}));

vi.mock("@/lib/prisma", () => ({ prisma }));
vi.mock("@/lib/follow-up-queue", () => ({ enqueueFollowUpJob }));
vi.mock("@/lib/redis", () => ({ getRedis: () => redis }));

import { POST } from "@/app/api/cron/sweep-follow-ups/route";

const originalSecret = process.env.CRON_SECRET;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = "cron-secret-123";
  redis.set.mockResolvedValue("OK");
  prisma.salesThread.findMany.mockResolvedValue([]);
  prisma.followUpTask.create.mockResolvedValue({ id: "task_1" });
  prisma.followUpTask.update.mockResolvedValue({ id: "task_1" });
  enqueueFollowUpJob.mockResolvedValue({ enqueued: true, jobId: "followup:task_1" });
});

afterEach(() => {
  if (originalSecret === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = originalSecret;
});

function makeRequest(secret?: string) {
  return new Request("https://app.test/api/cron/sweep-follow-ups", {
    method: "POST",
    headers: secret ? { "x-cron-secret": secret } : {}
  });
}

describe("POST /api/cron/sweep-follow-ups", () => {
  it("rejects missing or wrong secrets", async () => {
    expect((await POST(makeRequest())).status).toBe(401);
    expect((await POST(makeRequest("wrong"))).status).toBe(401);
    expect(enqueueFollowUpJob).not.toHaveBeenCalled();
  });

  it("enqueues due threads without active tasks", async () => {
    prisma.salesThread.findMany.mockResolvedValue([{ id: "thread_1", businessId: "biz_1", stageId: "stage_1", preferredChannel: "SMS" }]);

    const response = await POST(makeRequest("cron-secret-123"));
    const body = await response.json() as { due: number; enqueued: number };

    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true, due: 1, enqueued: 1 });
    expect(prisma.followUpTask.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ salesThreadId: "thread_1", channel: "SMS" })
    }));
    expect(enqueueFollowUpJob).toHaveBeenCalledWith({ taskId: "task_1", businessId: "biz_1" }, { delay: 0, jobId: "followup:task_1" });
  });
});
