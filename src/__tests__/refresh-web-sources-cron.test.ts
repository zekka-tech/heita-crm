import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { prisma, enqueueWebCrawlJob } = vi.hoisted(() => ({
  prisma: { webSource: { findMany: vi.fn() } },
  enqueueWebCrawlJob: vi.fn()
}));

vi.mock("@/lib/prisma", () => ({ prisma }));
vi.mock("@/lib/ai/web-crawl-queue", () => ({ enqueueWebCrawlJob }));

import { POST } from "@/app/api/cron/refresh-web-sources/route";

const ORIGINAL_SECRET = process.env.CRON_SECRET;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = "cron-secret-123";
  prisma.webSource.findMany.mockResolvedValue([]);
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
    const old = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000); // 8 days ago
    prisma.webSource.findMany.mockResolvedValue([
      { id: "src_due", refreshIntervalDays: 7, lastCrawledAt: old },
      { id: "src_fresh", refreshIntervalDays: 30, lastCrawledAt: new Date() },
      { id: "src_never", refreshIntervalDays: 7, lastCrawledAt: null }
    ]);

    const res = await POST(makeRequest("cron-secret-123"));
    const body = (await res.json()) as { ok: boolean; due: number; enqueued: number };

    expect(res.status).toBe(200);
    expect(body.due).toBe(2); // due + never, not fresh
    expect(enqueueWebCrawlJob).toHaveBeenCalledWith("src_due");
    expect(enqueueWebCrawlJob).toHaveBeenCalledWith("src_never");
    expect(enqueueWebCrawlJob).not.toHaveBeenCalledWith("src_fresh");
  });
});
