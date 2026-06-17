import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => {
  const prisma = {
    reward: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
  };
  return {
    prisma,
    withBusinessScope: vi.fn(async (_businessId: string, fn: (tx: typeof prisma) => unknown) => fn(prisma)),
  };
});

vi.mock("@/lib/whatsapp", () => ({
  sendWhatsAppInteractiveListMessage: vi.fn(),
  sendWhatsAppTextMessage: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { handleCommerceCommand, sendRewardsCatalog } from "@/server/services/whatsapp-commerce.service";
import { prisma } from "@/lib/prisma";
import { sendWhatsAppInteractiveListMessage, sendWhatsAppTextMessage } from "@/lib/whatsapp";

describe("sendRewardsCatalog", () => {
  beforeEach(() => vi.clearAllMocks());

  const baseInput = {
    phoneNumberId: "pid1",
    to: "27820000001",
    businessId: "biz1",
    businessName: "Test Shop",
  };

  it("sends a text message when no rewards are available", async () => {
    (prisma.reward.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

    await sendRewardsCatalog(baseInput);

    expect(sendWhatsAppTextMessage).toHaveBeenCalledWith({
      phoneNumberId: "pid1",
      to: "27820000001",
      body: "No rewards are currently available at Test Shop. Check back soon!",
    });
    expect(sendWhatsAppInteractiveListMessage).not.toHaveBeenCalled();
  });

  it("sends an interactive list when rewards are available", async () => {
    (prisma.reward.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { id: "r1", title: "Free Coffee", pointsCost: 200, description: "A hot cup" },
      { id: "r2", title: "Discount 10%", pointsCost: 500, description: "Save big" },
    ]);

    await sendRewardsCatalog(baseInput);

    expect(sendWhatsAppInteractiveListMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        phoneNumberId: "pid1",
        to: "27820000001",
        rows: expect.arrayContaining([
          expect.objectContaining({ id: "reward_r1", title: "1. Free Coffee" }),
          expect.objectContaining({ id: "reward_r2", title: "2. Discount 10%" }),
        ]),
      })
    );
  });

  it("handles rewards with null description", async () => {
    (prisma.reward.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { id: "r1", title: "Mystery Box", pointsCost: 100, description: null },
    ]);

    await sendRewardsCatalog(baseInput);

    expect(sendWhatsAppInteractiveListMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        rows: [
          expect.objectContaining({
            id: "reward_r1",
            title: "1. Mystery Box",
            description: expect.stringContaining("pts"),
          }),
        ],
      })
    );
  });
});

describe("handleCommerceCommand", () => {
  beforeEach(() => vi.clearAllMocks());

  const baseInput = {
    phoneNumberId: "pid1",
    to: "27820000001",
    businessId: "biz1",
    businessName: "Test Shop",
    userId: "user1",
  };

  it('detects "rewards" keyword', async () => {
    (prisma.reward.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

    const result = await handleCommerceCommand({ ...baseInput, body: "rewards" });
    expect(result.handled).toBe(true);
  });

  it('detects "catalog" keyword', async () => {
    (prisma.reward.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

    const result = await handleCommerceCommand({ ...baseInput, body: "catalog" });
    expect(result.handled).toBe(true);
  });

  it('detects "redeem" keyword (bare)', async () => {
    const result = await handleCommerceCommand({ ...baseInput, body: "redeem" });
    expect(result.handled).toBe(true);
  });

  it('detects "browse" keyword', async () => {
    (prisma.reward.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

    const result = await handleCommerceCommand({ ...baseInput, body: "browse" });
    expect(result.handled).toBe(true);
  });

  it('detects "what can i get" phrase', async () => {
    (prisma.reward.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

    const result = await handleCommerceCommand({ ...baseInput, body: "what can i get" });
    expect(result.handled).toBe(true);
  });

  it('detects "show rewards" keyword', async () => {
    (prisma.reward.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

    const result = await handleCommerceCommand({ ...baseInput, body: "show rewards" });
    expect(result.handled).toBe(true);
  });

  it('detects "view rewards" keyword', async () => {
    (prisma.reward.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

    const result = await handleCommerceCommand({ ...baseInput, body: "view rewards" });
    expect(result.handled).toBe(true);
  });

  it("returns handled=false for unknown messages", async () => {
    const result = await handleCommerceCommand({ ...baseInput, body: "hello how are you" });
    expect(result.handled).toBe(false);
  });

  it("parses redeem N command and finds the reward", async () => {
    (prisma.reward.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: "r1",
      title: "Free Coffee",
      pointsCost: 200,
    });

    const result = await handleCommerceCommand({ ...baseInput, body: "redeem 1" });
    expect(result.handled).toBe(true);
    expect(result.reply).toContain("Free Coffee");
    expect(result.reply).toContain("200");
  });

  it("handles invalid redeem number (reward not found)", async () => {
    (prisma.reward.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

    const result = await handleCommerceCommand({ ...baseInput, body: "redeem 999" });
    expect(result.handled).toBe(true);
    expect(result.reply).toContain("not available");
  });

  it("handles non-numeric redeem argument", async () => {
    const result = await handleCommerceCommand({ ...baseInput, body: "redeem abc" });
    expect(result.handled).toBe(true);
    expect(result.reply).toContain("Which reward");
  });

  it("handles redeem with non-numeric text", async () => {
    const result = await handleCommerceCommand({ ...baseInput, body: "redeem xyz" });
    expect(result.handled).toBe(true);
    expect(result.reply).toContain("Which reward");
  });

  it("catches errors when sending rewards catalog fails", async () => {
    (prisma.reward.findMany as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("DB down"));

    const result = await handleCommerceCommand({ ...baseInput, body: "rewards" });
    expect(result.handled).toBe(true);
    expect(result.reply).toContain("couldn't load the rewards catalog");
  });

  it("catches errors when looking up a redeem fails", async () => {
    (prisma.reward.findFirst as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("DB down"));

    const result = await handleCommerceCommand({ ...baseInput, body: "redeem 1" });
    expect(result.handled).toBe(true);
    expect(result.reply).toContain("something went wrong");
  });
});
