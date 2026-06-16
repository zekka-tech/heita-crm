import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  generateText: vi.fn(),
  embedText: vi.fn(),
  hybridSearch: vi.fn(),
  assertAiMessageQuotaAvailable: vi.fn(),
  recordAiTokenUsage: vi.fn(),
  business: { findUniqueOrThrow: vi.fn() }
}));

vi.mock("@/lib/ai/generate", () => ({ generateText: mocks.generateText }));
vi.mock("@/lib/ai/embeddings", () => ({ embedText: mocks.embedText }));
vi.mock("@/lib/ai/vector-store", () => ({ hybridSearch: mocks.hybridSearch }));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: { business: mocks.business } }));
vi.mock("@/server/services/ai-usage.service", () => ({
  assertAiMessageQuotaAvailable: mocks.assertAiMessageQuotaAvailable,
  recordAiTokenUsage: mocks.recordAiTokenUsage
}));

const { generateAdCopy, isAdCopyChannel } = await import("@/server/services/ai-ad.service");

beforeEach(() => {
  vi.clearAllMocks();
  mocks.assertAiMessageQuotaAvailable.mockResolvedValue({ limit: 1000, used: 10 });
  mocks.recordAiTokenUsage.mockResolvedValue({});
  mocks.embedText.mockResolvedValue([0.1, 0.2]);
  mocks.hybridSearch.mockResolvedValue([]);
  mocks.business.findUniqueOrThrow.mockResolvedValue({
    name: "Acme Coffee",
    category: "FOOD_AND_BEVERAGE",
    city: "Cape Town",
    province: "WESTERN_CAPE"
  });
  mocks.generateText.mockResolvedValue({
    text: JSON.stringify([
      { headline: "BOGO Friday", body: "Buy one get one free this Friday.", cta: "Come in" },
      { headline: "Treat a friend", body: "Bring a mate Friday — two for one.", cta: "Visit" }
    ]),
    runtime: "anthropic",
    model: "claude-haiku-4-5",
    usage: { inputTokens: 100, outputTokens: 50, cacheReadTokens: 0, cacheCreationTokens: 0 }
  });
});

describe("generateAdCopy", () => {
  it("parses structured variants and records AI usage", async () => {
    const result = await generateAdCopy({
      businessId: "biz1",
      userId: "user1",
      offer: "BOGO coffee Friday",
      channel: "WHATSAPP"
    });

    expect(result.variants).toHaveLength(2);
    expect(result.variants[0]).toMatchObject({ headline: "BOGO Friday", cta: "Come in" });
    expect(mocks.recordAiTokenUsage).toHaveBeenCalledWith(
      expect.objectContaining({ businessId: "biz1", runtime: "anthropic", totalTokens: 150 })
    );
  });

  it("enforces the AI allowance (propagates quota errors, no generation)", async () => {
    mocks.assertAiMessageQuotaAvailable.mockRejectedValueOnce(new Error("quota exceeded"));
    await expect(
      generateAdCopy({ businessId: "biz1", offer: "x", channel: "SMS" })
    ).rejects.toThrow(/quota/);
    expect(mocks.generateText).not.toHaveBeenCalled();
  });

  it("rejects an empty offer before touching the AI provider", async () => {
    await expect(generateAdCopy({ businessId: "biz1", offer: "   ", channel: "SMS" })).rejects.toThrow(
      /offer/i
    );
    expect(mocks.assertAiMessageQuotaAvailable).not.toHaveBeenCalled();
  });

  it("falls back to a single safe variant when the model returns unparseable output", async () => {
    mocks.generateText.mockResolvedValueOnce({
      text: "sorry I cannot do that",
      runtime: "fallback",
      model: null,
      usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 }
    });
    const result = await generateAdCopy({ businessId: "biz1", offer: "Spring sale", channel: "EMAIL" });
    expect(result.variants).toHaveLength(1);
    expect(result.variants[0]?.body).toContain("Spring sale");
  });

  it("clamps variant count and extracts JSON embedded in prose", async () => {
    mocks.generateText.mockResolvedValueOnce({
      text: 'Here you go: [{"headline":"A","body":"one"},{"headline":"B","body":"two"},{"headline":"C","body":"three"}] hope that helps',
      runtime: "ollama",
      model: "llama3.2",
      usage: { inputTokens: 5, outputTokens: 5, cacheReadTokens: 0, cacheCreationTokens: 0 }
    });
    const result = await generateAdCopy({
      businessId: "biz1",
      offer: "promo",
      channel: "IN_APP",
      variantCount: 2
    });
    expect(result.variants).toHaveLength(2); // clamped from 3 returned to requested 2
  });
});

describe("isAdCopyChannel", () => {
  it("validates channel values", () => {
    expect(isAdCopyChannel("WHATSAPP")).toBe(true);
    expect(isAdCopyChannel("PUSH")).toBe(false);
    expect(isAdCopyChannel(123)).toBe(false);
  });
});
