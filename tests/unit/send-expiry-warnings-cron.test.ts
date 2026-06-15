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

vi.mock("@/server/services/notification.service", () => ({
  sendNotification: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { sendPointsExpiryWarnings } from "@/server/services/loyalty.service";
import { prisma } from "@/lib/prisma";
import { sendNotification } from "@/server/services/notification.service";

describe("sendPointsExpiryWarnings", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns zero when no memberships have expiring points", async () => {
    (prisma.loyaltyTransaction.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

    const result = await sendPointsExpiryWarnings(7, new Date());
    expect(result.membershipsWarned).toBe(0);
    expect(result.warningsSent).toBe(0);
  });

  it("sends notifications for memberships with expiring points", async () => {
    const now = new Date("2026-06-01T00:00:00Z");
    const expiryDate = new Date("2026-06-03T00:00:00Z"); // 2 days from now

    (prisma.loyaltyTransaction.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      {
        id: "tx1",
        pointsDelta: 200,
        expiresAt: expiryDate,
        membership: {
          id: "mem1",
          userId: "user1",
          businessId: "biz1",
          pointsBalance: 500,
          business: { name: "Shop A" },
        },
        expiryTarget: null,
        refundTarget: null,
      },
    ]);

    const result = await sendPointsExpiryWarnings(7, now);
    expect(result.membershipsWarned).toBe(1);
    expect(result.warningsSent).toBe(1);
    expect(sendNotification).toHaveBeenCalledWith({
      userId: "user1",
      businessId: "biz1",
      title: "Points expiring soon",
      body: expect.stringContaining("200 points") as string,
      type: "POINTS_EXPIRING_SOON",
      actionUrl: "/b/biz1/rewards",
      metadata: {
        pointsExpiring: 200,
        earliestExpiry: expiryDate.toISOString(),
      },
    });
  });

  it("aggregates multiple transactions for the same membership", async () => {
    const now = new Date();
    const expiry1 = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    const expiry2 = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);

    (prisma.loyaltyTransaction.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      {
        id: "tx1",
        pointsDelta: 100,
        expiresAt: expiry1,
        membership: {
          id: "mem1",
          userId: "user1",
          businessId: "biz1",
          pointsBalance: 500,
          business: { name: "Shop A" },
        },
        expiryTarget: null,
        refundTarget: null,
      },
      {
        id: "tx2",
        pointsDelta: 50,
        expiresAt: expiry2,
        membership: {
          id: "mem1",
          userId: "user1",
          businessId: "biz1",
          pointsBalance: 500,
          business: { name: "Shop A" },
        },
        expiryTarget: null,
        refundTarget: null,
      },
    ]);

    const result = await sendPointsExpiryWarnings(7, now);
    expect(result.membershipsWarned).toBe(1);
    expect(result.warningsSent).toBe(1);
    expect(sendNotification).toHaveBeenCalledTimes(1);
    expect(sendNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          pointsExpiring: 150,
          earliestExpiry: expiry1.toISOString(),
        }),
      })
    );
  });

  it("handles notification send failures gracefully", async () => {
    const now = new Date();
    (prisma.loyaltyTransaction.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      {
        id: "tx1",
        pointsDelta: 100,
        expiresAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
        membership: {
          id: "mem1",
          userId: "user1",
          businessId: "biz1",
          pointsBalance: 500,
          business: { name: "Shop A" },
        },
        expiryTarget: null,
        refundTarget: null,
      },
    ]);

    (sendNotification as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("Push failed"));

    const result = await sendPointsExpiryWarnings(7, now);
    // warningsSent counts only successful sends, membershipsWarned counts groups
    expect(result.membershipsWarned).toBe(1);
    expect(result.warningsSent).toBe(0);
  });

  it("respects the daysBeforeExpiry parameter", async () => {
    const now = new Date("2026-06-01T00:00:00Z");
    (prisma.loyaltyTransaction.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

    await sendPointsExpiryWarnings(14, now);

    // Verify the query uses the correct threshold (now + 14 days)
    expect(prisma.loyaltyTransaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          expiresAt: {
            gt: now,
            lte: new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000),
          },
        }),
      })
    );
  });
});
