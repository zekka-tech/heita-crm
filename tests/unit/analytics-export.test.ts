import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => {
  const prisma = {
    loyaltyTransaction: {
      findMany: vi.fn(),
    },
  };

  return {
    prisma,
    withSystemScope: vi.fn(async (fn: (tx: typeof prisma) => unknown) => fn(prisma)),
  };
});

vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { generateAnonymisedBasketReport, sendBasketReport } from "@/server/services/analytics-export.service";
import { prisma } from "@/lib/prisma";

describe("generateAnonymisedBasketReport", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns empty array when no transactions exist", async () => {
    (prisma.loyaltyTransaction.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

    const report = await generateAnonymisedBasketReport();
    expect(report).toEqual([]);
  });

  it("buckets transactions by period (month), province, and category", async () => {
    (prisma.loyaltyTransaction.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      {
        type: "EARN",
        pointsDelta: 100,
        createdAt: new Date("2026-06-01"),
        membership: {
          business: { province: "GAUTENG", category: "RESTAURANT" },
        },
      },
      {
        type: "REDEEM",
        pointsDelta: -50,
        createdAt: new Date("2026-06-01"),
        membership: {
          business: { province: "GAUTENG", category: "RESTAURANT" },
        },
      },
    ]);

    const report = await generateAnonymisedBasketReport();
    expect(report).toHaveLength(1);
    expect(report[0]!.totalPointsEarned).toBe(100);
    expect(report[0]!.totalPointsRedeemed).toBe(50);
    // avgTransactionValue = (100 + 50) / 2 = 75
    expect(report[0]!.avgTransactionValue).toBe(75);
    expect(report[0]!.totalTransactions).toBe(2);
  });

  it("separates transactions by different provinces", async () => {
    (prisma.loyaltyTransaction.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      {
        type: "EARN",
        pointsDelta: 200,
        createdAt: new Date("2026-06-01"),
        membership: {
          business: { province: "GAUTENG", category: "RETAIL" },
        },
      },
      {
        type: "EARN",
        pointsDelta: 300,
        createdAt: new Date("2026-06-01"),
        membership: {
          business: { province: "KWAZULU_NATAL", category: "RETAIL" },
        },
      },
    ]);

    const report = await generateAnonymisedBasketReport();
    expect(report).toHaveLength(2);
    const provinces = report.map((r) => r.province).sort();
    expect(provinces).toEqual(["GAUTENG", "KWAZULU_NATAL"]);
  });

  it("separates transactions by different categories", async () => {
    (prisma.loyaltyTransaction.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      {
        type: "EARN",
        pointsDelta: 100,
        createdAt: new Date("2026-06-01"),
        membership: {
          business: { province: "GAUTENG", category: "RESTAURANT" },
        },
      },
      {
        type: "EARN",
        pointsDelta: 200,
        createdAt: new Date("2026-06-01"),
        membership: {
          business: { province: "GAUTENG", category: "RETAIL" },
        },
      },
    ]);

    const report = await generateAnonymisedBasketReport();
    expect(report).toHaveLength(2);
    const categories = report.map((r) => r.category).sort();
    expect(categories).toEqual(["RESTAURANT", "RETAIL"]);
  });

  it("separates transactions by different months", async () => {
    (prisma.loyaltyTransaction.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      {
        type: "EARN",
        pointsDelta: 100,
        createdAt: new Date("2026-01-15"),
        membership: {
          business: { province: "GAUTENG", category: "RESTAURANT" },
        },
      },
      {
        type: "EARN",
        pointsDelta: 200,
        createdAt: new Date("2026-06-01"),
        membership: {
          business: { province: "GAUTENG", category: "RESTAURANT" },
        },
      },
    ]);

    const report = await generateAnonymisedBasketReport();
    expect(report).toHaveLength(2);
    const periods = report.map((r) => r.period).sort();
    expect(periods).toEqual(["2026-01", "2026-06"]);
  });

  it("handles transactions with zero pointsDelta correctly", async () => {
    (prisma.loyaltyTransaction.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      {
        type: "EARN",
        pointsDelta: 0,
        createdAt: new Date("2026-06-01"),
        membership: {
          business: { province: "GAUTENG", category: "RESTAURANT" },
        },
      },
    ]);

    const report = await generateAnonymisedBasketReport();
    expect(report).toHaveLength(1);
    expect(report[0]!.totalPointsEarned).toBe(0);
    expect(report[0]!.totalPointsRedeemed).toBe(0);
    expect(report[0]!.avgTransactionValue).toBe(0);
  });

  it("respects the days parameter", async () => {
    (prisma.loyaltyTransaction.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

    await generateAnonymisedBasketReport(30);

    expect(prisma.loyaltyTransaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          createdAt: {
            gte: expect.any(Date) as Date,
          },
        }),
      })
    );
  });

  it("correctly handles transactions where membership business is missing province", async () => {
    (prisma.loyaltyTransaction.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      {
        type: "EARN",
        pointsDelta: 100,
        createdAt: new Date("2026-06-01"),
        membership: {
          business: { province: null, category: null },
        },
      },
    ]);

    const report = await generateAnonymisedBasketReport();
    expect(report).toHaveLength(1);
    // When province/category are null, they become the string "null" in the key
    // This tests the service handles null gracefully
    expect(report[0]!.totalPointsEarned).toBe(100);
  });
});

describe("sendBasketReport", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls generateAnonymisedBasketReport and returns the result", async () => {
    (prisma.loyaltyTransaction.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      {
        type: "EARN",
        pointsDelta: 50,
        createdAt: new Date("2026-06-01"),
        membership: {
          business: { province: "GAUTENG", category: "RESTAURANT" },
        },
      },
    ]);

    const report = await sendBasketReport();
    expect(report).toHaveLength(1);
  });

  it("returns empty array when no transactions exist", async () => {
    (prisma.loyaltyTransaction.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

    const report = await sendBasketReport();
    expect(report).toEqual([]);
  });
});
