import { beforeEach, describe, expect, it, vi } from "vitest";

const prisma = {
  business: {
    findUniqueOrThrow: vi.fn()
  },
  aiTokenUsage: {
    aggregate: vi.fn(),
    create: vi.fn()
  }
};

vi.mock("@/lib/prisma", () => ({
  prisma
}));

const {
  AiUsageQuotaExceededError,
  assertAiMessageQuotaAvailable,
  buildAiQuotaExceededResponse,
  estimateTokenCount,
  recordAiTokenUsage
} = await import("@/server/services/ai-usage.service");

describe("ai usage service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("estimates tokens conservatively from text segments", () => {
    expect(estimateTokenCount("hello world")).toBeGreaterThan(0);
    expect(estimateTokenCount("", null, undefined)).toBe(0);
  });

  it("allows usage when the business plan still has quota", async () => {
    prisma.business.findUniqueOrThrow.mockResolvedValue({
      id: "business_123",
      planId: "FREE"
    });
    prisma.aiTokenUsage.aggregate.mockResolvedValue({
      _sum: { messageUnits: 42 }
    });

    await expect(
      assertAiMessageQuotaAvailable({ businessId: "business_123" })
    ).resolves.toMatchObject({
      businessId: "business_123",
      planId: "FREE",
      limit: 200,
      used: 42
    });
  });

  it("rejects usage when the monthly cap has been reached", async () => {
    prisma.business.findUniqueOrThrow.mockResolvedValue({
      id: "business_123",
      planId: "FREE"
    });
    prisma.aiTokenUsage.aggregate.mockResolvedValue({
      _sum: { messageUnits: 200 }
    });

    await expect(
      assertAiMessageQuotaAvailable({ businessId: "business_123" })
    ).rejects.toBeInstanceOf(AiUsageQuotaExceededError);
  });

  it("persists usage rows with normalized nullables", async () => {
    prisma.aiTokenUsage.create.mockResolvedValue({ id: "usage_123" });

    await recordAiTokenUsage({
      businessId: "business_123",
      runtime: "anthropic",
      model: "claude",
      promptTokens: 120,
      completionTokens: 80,
      totalTokens: 200
    });

    expect(prisma.aiTokenUsage.create).toHaveBeenCalledWith({
      data: {
        businessId: "business_123",
        sessionId: null,
        userId: null,
        runtime: "anthropic",
        model: "claude",
        promptTokens: 120,
        completionTokens: 80,
        totalTokens: 200,
        messageUnits: 1
      }
    });
  });

  it("builds a structured quota response payload", () => {
    const payload = buildAiQuotaExceededResponse(
      new AiUsageQuotaExceededError("business_123", 200, 200)
    );

    expect(payload).toEqual({
      error: "AI quota exceeded for the current billing period.",
      code: "AI_QUOTA_EXCEEDED",
      limit: 200,
      used: 200
    });
  });
});
