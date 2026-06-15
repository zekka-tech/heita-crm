import { beforeEach, describe, expect, it, vi } from "vitest";

const prisma = {
  business: {
    findUniqueOrThrow: vi.fn()
  },
  aiTokenUsage: {
    aggregate: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn()
  },
  $transaction: vi.fn(),
  $executeRaw: vi.fn()
};

const withBusinessScope = vi.fn(async (_businessId: string, fn: (tx: typeof prisma) => unknown) =>
  fn(prisma)
);

vi.mock("@/lib/prisma", () => ({
  prisma,
  withBusinessScope
}));

const {
  AiUsageQuotaExceededError,
  assertAiMessageQuotaAvailable,
  buildAiQuotaExceededResponse,
  checkAiMessageAllowance,
  estimateTokenCount,
  recordAiTokenUsage,
  reserveAiMessageQuota
} = await import("@/server/services/ai-usage.service");

describe("ai usage service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    withBusinessScope.mockImplementation(async (_businessId: string, fn: (tx: typeof prisma) => unknown) => fn(prisma));
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

    expect(withBusinessScope).toHaveBeenCalledWith("business_123", expect.any(Function));
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
      used: 200,
      overageAllowed: false,
      overagePriceZar: 0
    });
  });

  it("normalizes quota responses to strict hard-cap semantics", () => {
    const payload = buildAiQuotaExceededResponse(
      new AiUsageQuotaExceededError("business_123", 1500, 1500, true, 0.20)
    );

    expect(payload).toEqual({
      error: "AI quota exceeded for the current billing period.",
      code: "AI_QUOTA_EXCEEDED",
      limit: 1500,
      used: 1500,
      overageAllowed: false,
      overagePriceZar: 0
    });
  });

  describe("hard cap enforcement", () => {
    it("rejects FREE plan when quota exceeded", async () => {
      prisma.business.findUniqueOrThrow.mockResolvedValue({
        id: "business_123",
        planId: "FREE"
      });
      prisma.aiTokenUsage.aggregate.mockResolvedValue({
        _sum: { messageUnits: 200 }
      });

      const err = await assertAiMessageQuotaAvailable({ businessId: "business_123" })
        .then(() => null)
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(AiUsageQuotaExceededError);
      expect((err as InstanceType<typeof AiUsageQuotaExceededError>).overageAllowed).toBe(false);
      expect((err as InstanceType<typeof AiUsageQuotaExceededError>).overagePriceZar).toBe(0);
    });

    it("keeps paid plans on the same hard cap when quota is exceeded", async () => {
      prisma.business.findUniqueOrThrow.mockResolvedValue({
        id: "business_123",
        planId: "STARTER"
      });
      prisma.aiTokenUsage.aggregate.mockResolvedValue({
        _sum: { messageUnits: 1500 }
      });

      const err = await assertAiMessageQuotaAvailable({ businessId: "business_123" })
        .then(() => null)
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(AiUsageQuotaExceededError);
      expect((err as InstanceType<typeof AiUsageQuotaExceededError>).overageAllowed).toBe(false);
      expect((err as InstanceType<typeof AiUsageQuotaExceededError>).overagePriceZar).toBe(0);
    });

    it("checkAiMessageAllowance returns overage fields for FREE plan", async () => {
      prisma.business.findUniqueOrThrow.mockResolvedValue({
        id: "business_123",
        planId: "FREE"
      });
      prisma.aiTokenUsage.aggregate.mockResolvedValue({
        _sum: { messageUnits: 200 }
      });

      const result = await checkAiMessageAllowance("business_123");

      expect(result.allowed).toBe(false);
      expect(result.overageAllowed).toBe(false);
      expect(result.overagePriceZar).toBe(0);
    });

    it("checkAiMessageAllowance reports a hard cap for paid plans too", async () => {
      prisma.business.findUniqueOrThrow.mockResolvedValue({
        id: "business_123",
        planId: "STARTER"
      });
      prisma.aiTokenUsage.aggregate.mockResolvedValue({
        _sum: { messageUnits: 1500 }
      });

      const result = await checkAiMessageAllowance("business_123");

      expect(result.allowed).toBe(false);
      expect(result.overageAllowed).toBe(false);
      expect(result.overagePriceZar).toBe(0);
    });

    it("reserveAiMessageQuota rejects paid plans once the hard cap is reached", async () => {
      prisma.business.findUniqueOrThrow.mockResolvedValue({
        id: "business_123",
        planId: "STARTER"
      });
      prisma.aiTokenUsage.aggregate.mockResolvedValue({
        _sum: { messageUnits: 1500 }
      });

      prisma.$transaction.mockImplementation(
        async (fn: (tx: typeof prisma) => unknown) => fn(prisma)
      );

      await expect(
        reserveAiMessageQuota({
          businessId: "business_123",
          sessionId: "session_1",
          userId: "user_1"
        })
      ).rejects.toBeInstanceOf(AiUsageQuotaExceededError);
      expect(prisma.aiTokenUsage.create).not.toHaveBeenCalled();
    });

    it("reserveAiMessageQuota throws for FREE plan when quota exceeded", async () => {
      prisma.business.findUniqueOrThrow.mockResolvedValue({
        id: "business_123",
        planId: "FREE"
      });
      prisma.aiTokenUsage.aggregate.mockResolvedValue({
        _sum: { messageUnits: 200 }
      });

      prisma.$transaction.mockImplementation(
        async (fn: (tx: typeof prisma) => unknown) => fn(prisma)
      );

      await expect(
        reserveAiMessageQuota({
          businessId: "business_123",
          sessionId: "session_1",
          userId: "user_1"
        })
      ).rejects.toBeInstanceOf(AiUsageQuotaExceededError);
    });
  });
});
