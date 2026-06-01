import { beforeEach, describe, expect, it, vi } from "vitest";

const { prisma, enqueueWebCrawlJob, assertPublicHttpUrl, recordStaffAuditLog } = vi.hoisted(() => ({
  prisma: {
    aiWorkspace: { findUnique: vi.fn() },
    webSource: {
      count: vi.fn(),
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn()
    }
  },
  enqueueWebCrawlJob: vi.fn(),
  assertPublicHttpUrl: vi.fn(),
  recordStaffAuditLog: vi.fn()
}));

vi.mock("@/lib/prisma", () => ({ prisma }));
vi.mock("@/lib/ai/web-crawl-queue", () => ({ enqueueWebCrawlJob }));
vi.mock("@/lib/security", () => ({ assertPublicHttpUrl }));
vi.mock("@/server/services/staff-audit.service", () => ({ recordStaffAuditLog }));

import {
  createWebSource,
  deleteWebSource,
  refreshWebSource
} from "@/server/services/web-source.service";

beforeEach(() => {
  vi.clearAllMocks();
  assertPublicHttpUrl.mockResolvedValue(["93.184.216.34"]);
  prisma.aiWorkspace.findUnique.mockResolvedValue({ id: "ws_1" });
  prisma.webSource.count.mockResolvedValue(0);
  prisma.webSource.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
    Promise.resolve({ id: "src_1", ...data })
  );
  enqueueWebCrawlJob.mockResolvedValue({ enqueued: true });
});

describe("createWebSource", () => {
  it("clamps depth/pages to the hard ceilings and enqueues a crawl", async () => {
    const source = await createWebSource({
      businessId: "biz_1",
      rootUrl: "https://acme.co.za",
      maxDepth: 99,
      maxPages: 9999,
      refreshIntervalDays: 7
    });

    const created = prisma.webSource.create.mock.calls[0]![0].data;
    expect(created.maxDepth).toBe(3); // MAX_CRAWL_DEPTH
    expect(created.maxPages).toBe(50); // MAX_CRAWL_PAGES
    expect(created.refreshIntervalDays).toBe(7);
    expect(created.domain).toBe("acme.co.za");
    expect(enqueueWebCrawlJob).toHaveBeenCalledWith("src_1");
    expect(source.id).toBe("src_1");
  });

  it("normalises an unsupported refresh interval to manual (0)", async () => {
    await createWebSource({
      businessId: "biz_1",
      rootUrl: "https://acme.co.za",
      maxDepth: 1,
      maxPages: 10,
      refreshIntervalDays: 3
    });
    expect(prisma.webSource.create.mock.calls[0]![0].data.refreshIntervalDays).toBe(0);
  });

  it("rejects an unreachable/SSRF URL with a 400", async () => {
    assertPublicHttpUrl.mockRejectedValue(new Error("assertPublicHttpUrl: not publicly routable"));
    await expect(
      createWebSource({ businessId: "biz_1", rootUrl: "http://localhost", maxDepth: 1, maxPages: 5, refreshIntervalDays: 0 })
    ).rejects.toMatchObject({ status: 400, code: "INVALID_URL" });
    expect(prisma.webSource.create).not.toHaveBeenCalled();
  });

  it("enforces the per-business source cap", async () => {
    prisma.webSource.count.mockResolvedValue(10);
    await expect(
      createWebSource({ businessId: "biz_1", rootUrl: "https://acme.co.za", maxDepth: 1, maxPages: 5, refreshIntervalDays: 0 })
    ).rejects.toMatchObject({ status: 429, code: "WEB_SOURCE_LIMIT" });
  });

  it("404s when the business has no AI workspace", async () => {
    prisma.aiWorkspace.findUnique.mockResolvedValue(null);
    await expect(
      createWebSource({ businessId: "biz_1", rootUrl: "https://acme.co.za", maxDepth: 1, maxPages: 5, refreshIntervalDays: 0 })
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe("deleteWebSource / refreshWebSource", () => {
  it("deletes a source owned by the business", async () => {
    prisma.webSource.findUnique.mockResolvedValue({ id: "src_1", businessId: "biz_1" });
    prisma.webSource.delete.mockResolvedValue({});
    await deleteWebSource({ id: "src_1", businessId: "biz_1" });
    expect(prisma.webSource.delete).toHaveBeenCalledWith({ where: { id: "src_1" } });
  });

  it("refuses to mutate a source from another business", async () => {
    prisma.webSource.findUnique.mockResolvedValue({ id: "src_1", businessId: "other_biz" });
    await expect(deleteWebSource({ id: "src_1", businessId: "biz_1" })).rejects.toMatchObject({ status: 404 });
    expect(prisma.webSource.delete).not.toHaveBeenCalled();
  });

  it("refresh re-enqueues a crawl", async () => {
    prisma.webSource.findUnique.mockResolvedValue({ id: "src_1", businessId: "biz_1" });
    prisma.webSource.update.mockResolvedValue({ id: "src_1", status: "PENDING" });
    await refreshWebSource({ id: "src_1", businessId: "biz_1" });
    expect(enqueueWebCrawlJob).toHaveBeenCalledWith("src_1");
  });
});
