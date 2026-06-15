import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { prisma, withBusinessScope, enqueueWebCrawlJob } = vi.hoisted(() => ({
  prisma: {
    business: { findMany: vi.fn() },
    webSource: { findMany: vi.fn() }
  },
  withBusinessScope: vi.fn(async (_businessId: string, fn: (tx: typeof prisma) => unknown) => fn(prisma)),
  enqueueWebCrawlJob: vi.fn()
}));

vi.mock("@/lib/prisma", () => ({ prisma, withBusinessScope }));
vi.mock("@/lib/ai/web-crawl-queue", () => ({ enqueueWebCrawlJob }));

import { POST } from "@/app/api/cron/refresh-web-sources/route";

const ORIGINAL_SECRET = process.env.CRON_SECRET;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = "cron-secret-123";
  prisma.business.findMany.mockResolvedValue([]);
  prisma.webSource.findMany.mockResolvedValue([]);
  withBusinessScope.mockImplementation(async (_businessId: string, fn: (tx: typeof prisma) => unknown) => fn(prisma));
});

afterEach(() => {
  process.env.CRON_SECRET = ORIGINAL_SECRET;
});

function makeRequest(secret?: string) {
  return new Request("https://app.test/api/cron/refresh-web-sources", {
    method: "POST",
    headers: secret ? { "x-cron-secret": secret } : {}
  });
}

describe("POST /api/cron/refresh-web-sources", () => {
  it("rejects requests without the secret", async () => {
    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
    expect(enqueueWebCrawlJob).not.toHaveBeenCalled();
  });

  it("rejects requests with the wrong secret", async () => {
    const res = await POST(makeRequest("wrong"));
    expect(res.status).toBe(401);
  });

  it("enqueues crawls for due sources with the correct secret", async () => {
    const old = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    prisma.business.findMany.mockResolvedValue([{ id: "biz_1" }, { id: "biz_2" }]);
    prisma.webSource.findMany
      .mockResolvedValueOnce([
        { id: "src_due", businessId: "biz_1", refreshIntervalDays: 7, lastCrawledAt: old },
        { id: "src_fresh", businessId: "biz_1", refreshIntervalDays: 30, lastCrawledAt: new Date() }
      ])
      .mockResolvedValueOnce([
        { id: "src_never", businessId: "biz_2", refreshIntervalDays: 7, lastCrawledAt: null }
      ]);

    const res = await POST(makeRequest("cron-secret-123"));
    const body = (await res.json()) as { ok: boolean; due: number; enqueued: number };

    expect(res.status).toBe(200);
    expect(body.due).toBe(2);
    expect(enqueueWebCrawlJob).toHaveBeenCalledWith("src_due", "biz_1");
    expect(enqueueWebCrawlJob).toHaveBeenCalledWith("src_never", "biz_2");
    expect(enqueueWebCrawlJob).not.toHaveBeenCalledWith("src_fresh", "biz_1");
  });
});
