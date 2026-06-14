import { describe, it, expect, vi, beforeEach } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    loyaltyTransaction: { findMany: vi.fn() },
    promotion: { findMany: vi.fn() }
  }
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
  withBusinessScope: vi.fn(async (_businessId: string, fn: (tx: typeof prismaMock) => unknown) => fn(prismaMock))
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { prisma } from "@/lib/prisma";
import { generatePromotionSuggestions } from "@/server/services/ai-promotion.service";

describe("generatePromotionSuggestions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("suggests a flash sale when redemptions are high and no flash sale is active", async () => {
    (prisma.loyaltyTransaction.findMany as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([
        { pointsDelta: -500, createdAt: new Date(), membership: { tier: { name: "Gold" } } },
      ])
      .mockResolvedValueOnce([]);

    (prisma.promotion.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

    const result = await generatePromotionSuggestions("biz1");
    expect(result.length).toBeGreaterThan(0);
    expect(result.some((s) => s.type === "FLASH_SALE")).toBe(true);
  });

  it("suggests bonus points when daily earnings are positive and no bonus points active", async () => {
    (prisma.loyaltyTransaction.findMany as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { pointsDelta: 100, createdAt: new Date() },
        { pointsDelta: 50, createdAt: new Date() },
      ]);

    (prisma.promotion.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

    const result = await generatePromotionSuggestions("biz1");
    expect(result.some((s) => s.type === "BONUS_POINTS")).toBe(true);
  });

  it("returns at least one fallback suggestion even with no activity", async () => {
    (prisma.loyaltyTransaction.findMany as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    (prisma.promotion.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

    const result = await generatePromotionSuggestions("biz1");
    expect(result.length).toBeGreaterThan(0);
    // The fallback should be BONUS_POINTS since no flash sale conditions are met
    expect(result[0]!.type).toBe("BONUS_POINTS");
  });

  it("does not suggest flash sale if one is already active", async () => {
    (prisma.loyaltyTransaction.findMany as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([
        { pointsDelta: -1000, createdAt: new Date(), membership: { tier: { name: "Gold" } } },
      ])
      .mockResolvedValueOnce([]);

    (prisma.promotion.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { title: "Existing Flash", type: "FLASH_SALE" },
    ]);

    const result = await generatePromotionSuggestions("biz1");
    expect(result.some((s) => s.type === "FLASH_SALE")).toBe(false);
  });

  it("skips the data-driven bonus points suggestion when BONUS_POINTS is active but still returns fallback", async () => {
    // BONUS_POINTS already active → skips the "Double Points Day" suggestion.
    // However, when no other suggestions are generated, the fallback
    // "Welcome Back Bonus" (also type BONUS_POINTS) is still returned.
    (prisma.loyaltyTransaction.findMany as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { pointsDelta: 200, createdAt: new Date() },
      ]);

    (prisma.promotion.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { title: "Existing Bonus", type: "BONUS_POINTS" },
    ]);

    const result = await generatePromotionSuggestions("biz1");
    // Fallback suggestion has type BONUS_POINTS but name "Welcome Back Bonus"
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]!.name).toBe("Welcome Back Bonus");
  });

  it("skips both suggestions when flash sale and bonus points are active, returns fallback", async () => {
    (prisma.loyaltyTransaction.findMany as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([
        { pointsDelta: -1000, createdAt: new Date(), membership: { tier: { name: "Gold" } } },
      ])
      .mockResolvedValueOnce([
        { pointsDelta: 200, createdAt: new Date() },
      ]);

    (prisma.promotion.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { title: "Existing Flash", type: "FLASH_SALE" },
      { title: "Existing Bonus", type: "BONUS_POINTS" },
    ]);

    const result = await generatePromotionSuggestions("biz1");
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]!.name).toBe("Welcome Back Bonus");
  });

  it("uses flash sale when redemptions are low but still has bonus points opportunity", async () => {
    // Redemptions below 50 avg - no flash sale triggered
    (prisma.loyaltyTransaction.findMany as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([
        { pointsDelta: -10, createdAt: new Date(), membership: { tier: { name: "Bronze" } } },
      ])
      .mockResolvedValueOnce([
        { pointsDelta: 30, createdAt: new Date() },
      ]);

    (prisma.promotion.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

    const result = await generatePromotionSuggestions("biz1");
    // Should have bonus points (daily average > 0) but not flash sale (avgRedeemed < 50)
    expect(result.some((s) => s.type === "BONUS_POINTS")).toBe(true);
    expect(result.some((s) => s.type === "FLASH_SALE")).toBe(false);
  });
});
