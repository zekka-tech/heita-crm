import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    customerSegment: {
      findMany: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
    },
    $queryRaw: vi.fn(),
  },
}));

import { getSegmentMemberCount, listSegments, createSegment, deleteSegment } from "@/server/services/segment.service";
import { prisma } from "@/lib/prisma";

describe("listSegments", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns active segments for a business", async () => {
    (prisma.customerSegment.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { id: "s1", name: "Gold", description: null, rules: {}, createdAt: new Date("2026-01-01") },
      { id: "s2", name: "VIP", description: "Top spenders", rules: {}, createdAt: new Date("2026-02-01") },
    ]);

    const result = await listSegments("biz1");
    expect(result).toHaveLength(2);
    expect(result[0]!.name).toBe("Gold");
    expect(result[1]!.name).toBe("VIP");

    expect(prisma.customerSegment.findMany).toHaveBeenCalledWith({
      where: { businessId: "biz1", isActive: true },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        description: true,
        rules: true,
        createdAt: true,
      },
    });
  });

  it("returns empty array when no active segments exist", async () => {
    (prisma.customerSegment.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

    const result = await listSegments("biz1");
    expect(result).toEqual([]);
  });
});

describe("createSegment", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates a segment and returns it", async () => {
    (prisma.customerSegment.create as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: "new1",
      name: "New Segment",
      businessId: "biz1",
    });

    const result = await createSegment({
      businessId: "biz1",
      name: "New Segment",
      description: "A test segment",
      rules: {
        rules: [{ field: "totalSpent", operator: "gte", value: 500 }],
        matchAll: true,
      },
    });

    expect(result).toBeDefined();
    expect(prisma.customerSegment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        businessId: "biz1",
        name: "New Segment",
        description: "A test segment",
      }),
    });
  });

  it("creates a segment with null description when not provided", async () => {
    (prisma.customerSegment.create as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: "new2",
      name: "No Desc",
    });

    await createSegment({
      businessId: "biz1",
      name: "No Desc",
      rules: { rules: [], matchAll: true },
    });

    expect(prisma.customerSegment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        description: null,
      }),
    });
  });
});

describe("deleteSegment", () => {
  beforeEach(() => vi.clearAllMocks());

  it("soft-deletes by setting isActive to false", async () => {
    (prisma.customerSegment.updateMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ count: 1 });

    const result = await deleteSegment("s1", "biz1");
    expect(result.count).toBe(1);
    expect(prisma.customerSegment.updateMany).toHaveBeenCalledWith({
      where: { id: "s1", businessId: "biz1" },
      data: { isActive: false },
    });
  });

  it("returns 0 when no matching segment found", async () => {
    (prisma.customerSegment.updateMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ count: 0 });

    const result = await deleteSegment("nonexistent", "biz1");
    expect(result.count).toBe(0);
  });
});

describe("getSegmentMemberCount", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns count from raw query for simple rules", async () => {
    (prisma.$queryRaw as ReturnType<typeof vi.fn>).mockResolvedValueOnce([{ count: 42n }]);

    const count = await getSegmentMemberCount("biz1", {
      rules: [{ field: "totalSpent", operator: "gte", value: 500 }],
      matchAll: true,
    });
    expect(count).toBe(42);
  });

  it("returns 0 when raw query returns empty array", async () => {
    (prisma.$queryRaw as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

    const count = await getSegmentMemberCount("biz1", {
      rules: [],
      matchAll: true,
    });
    expect(count).toBe(0);
  });

  it("returns 0 when count is null", async () => {
    (prisma.$queryRaw as ReturnType<typeof vi.fn>).mockResolvedValueOnce([{ count: null }]);

    const count = await getSegmentMemberCount("biz1", {
      rules: [{ field: "totalSpent", operator: "gte", value: 100 }],
      matchAll: false,
    });
    expect(count).toBe(0);
  });

  it("handles multiple rules with matchAll condition", async () => {
    (prisma.$queryRaw as ReturnType<typeof vi.fn>).mockResolvedValueOnce([{ count: 10n }]);

    const count = await getSegmentMemberCount("biz1", {
      rules: [
        { field: "totalSpent", operator: "gte", value: 100 },
        { field: "province", operator: "eq", value: "GAUTENG" },
      ],
      matchAll: true,
    });
    expect(count).toBe(10);
  });

  it("ignores rules with unknown field names", async () => {
    (prisma.$queryRaw as ReturnType<typeof vi.fn>).mockResolvedValueOnce([{ count: 5n }]);

    const count = await getSegmentMemberCount("biz1", {
      rules: [
        { field: "unknownField", operator: "eq", value: "test" },
        { field: "totalSpent", operator: "gte", value: 100 },
      ],
      matchAll: true,
    });
    // Only the valid rule should be applied
    expect(count).toBe(5);
  });
});
