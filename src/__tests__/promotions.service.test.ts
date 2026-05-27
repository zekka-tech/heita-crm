import { PromotionType, StaffRole } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const prisma = {
  $transaction: vi.fn(),
  staffMember: {
    findUnique: vi.fn()
  },
  promotion: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    create: vi.fn(),
    update: vi.fn()
  },
  membership: {
    findMany: vi.fn()
  },
  staffAuditLog: {
    create: vi.fn()
  }
};

const sendNotification = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma
}));

vi.mock("@/server/services/notification.service", () => ({
  sendNotification
}));

const {
  broadcastPromotion,
  createPromotion
} = await import("@/server/services/promotions.service");

function mockManagerRole(businessId = "biz_1") {
  prisma.staffMember.findUnique.mockResolvedValue({
    role: StaffRole.MANAGER,
    businessId
  });
}

describe("promotions service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.$transaction.mockImplementation(
      async (callback: (tx: typeof prisma) => unknown) => callback(prisma)
    );
  });

  describe("createPromotion", () => {
    it("rejects when end date is not after start date", async () => {
      mockManagerRole();

      const startsAt = new Date("2026-06-01T10:00:00Z");
      const endsAt = new Date("2026-06-01T10:00:00Z");

      await expect(
        createPromotion({
          businessId: "biz_1",
          actorUserId: "user_1",
          title: "Test promo",
          type: PromotionType.DISCOUNT,
          startsAt,
          endsAt
        })
      ).rejects.toThrow(/end date must be after the start date/i);

      expect(prisma.promotion.create).not.toHaveBeenCalled();
    });

    it("creates a promotion and writes a staff audit log", async () => {
      mockManagerRole();
      prisma.promotion.create.mockResolvedValue({
        id: "promo_1",
        title: "Winter sale",
        type: PromotionType.DISCOUNT,
        startsAt: new Date("2026-06-01T10:00:00Z"),
        endsAt: new Date("2026-06-08T10:00:00Z"),
        code: "WINTER25",
        targetTierIds: []
      });

      await createPromotion({
        businessId: "biz_1",
        actorUserId: "user_1",
        title: "Winter sale",
        type: PromotionType.DISCOUNT,
        startsAt: new Date("2026-06-01T10:00:00Z"),
        endsAt: new Date("2026-06-08T10:00:00Z"),
        code: "winter25"
      });

      expect(prisma.promotion.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          businessId: "biz_1",
          title: "Winter sale",
          type: PromotionType.DISCOUNT,
          code: "WINTER25",
          targetTierIds: []
        })
      });
      expect(prisma.staffAuditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: "promotion.create",
          targetType: "Promotion",
          targetId: "promo_1"
        })
      });
    });
  });

  describe("broadcastPromotion", () => {
    it("targets only members in matching tiers when targetTierIds is set", async () => {
      mockManagerRole();
      prisma.promotion.findUniqueOrThrow.mockResolvedValue({
        id: "promo_1",
        businessId: "biz_1",
        title: "Gold-only sale",
        description: "Exclusive perk",
        isActive: true,
        startsAt: new Date(Date.now() - 60_000),
        endsAt: new Date(Date.now() + 60_000),
        broadcastAt: null,
        targetTierIds: ["tier_gold"],
        business: { id: "biz_1", slug: "acme", name: "Acme" }
      });
      prisma.membership.findMany
        .mockResolvedValueOnce([
          { id: "m1", userId: "u1" },
          { id: "m2", userId: "u2" }
        ])
        .mockResolvedValue([]);
      sendNotification.mockResolvedValue(null);
      prisma.promotion.update.mockResolvedValue({});

      const result = await broadcastPromotion({
        promotionId: "promo_1",
        businessId: "biz_1",
        actorUserId: "user_1"
      });

      expect(prisma.membership.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            businessId: "biz_1",
            isActive: true,
            tierId: { in: ["tier_gold"] }
          }),
          select: { id: true, userId: true }
        })
      );
      expect(sendNotification).toHaveBeenCalledTimes(2);
      expect(sendNotification).toHaveBeenCalledWith({
        userId: "u1",
        businessId: "biz_1",
        title: "Gold-only sale",
        body: "Exclusive perk",
        type: "PROMOTION",
        actionUrl: "/b/acme"
      });
      expect(result.recipientCount).toBe(2);
      expect(result.failedCount).toBe(0);
    });

    it("targets all active memberships when targetTierIds is empty", async () => {
      mockManagerRole();
      prisma.promotion.findUniqueOrThrow.mockResolvedValue({
        id: "promo_2",
        businessId: "biz_1",
        title: "Storewide sale",
        description: null,
        isActive: true,
        startsAt: new Date(Date.now() - 60_000),
        endsAt: new Date(Date.now() + 60_000),
        broadcastAt: null,
        targetTierIds: [],
        business: { id: "biz_1", slug: "acme", name: "Acme" }
      });
      prisma.membership.findMany
        .mockResolvedValueOnce([
          { id: "m1", userId: "u1" },
          { id: "m2", userId: "u2" },
          { id: "m3", userId: "u3" }
        ])
        .mockResolvedValue([]);
      sendNotification.mockResolvedValue(null);
      prisma.promotion.update.mockResolvedValue({});

      const result = await broadcastPromotion({
        promotionId: "promo_2",
        businessId: "biz_1",
        actorUserId: "user_1"
      });

      expect(prisma.membership.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            businessId: "biz_1",
            isActive: true
          }),
          select: { id: true, userId: true }
        })
      );
      expect(sendNotification).toHaveBeenCalledTimes(3);
      expect(result.recipientCount).toBe(3);
    });

    it("stamps broadcastAt and writes a broadcast audit log with failure count", async () => {
      mockManagerRole();
      prisma.promotion.findUniqueOrThrow.mockResolvedValue({
        id: "promo_3",
        businessId: "biz_1",
        title: "Storewide",
        description: "Body",
        isActive: true,
        startsAt: new Date(Date.now() - 60_000),
        endsAt: new Date(Date.now() + 60_000),
        broadcastAt: null,
        targetTierIds: [],
        business: { id: "biz_1", slug: "acme", name: "Acme" }
      });
      prisma.membership.findMany
        .mockResolvedValueOnce([
          { id: "m1", userId: "u1" },
          { id: "m2", userId: "u2" }
        ])
        .mockResolvedValue([]);
      sendNotification
        .mockResolvedValueOnce(null)
        .mockRejectedValueOnce(new Error("push failed"));
      prisma.promotion.update.mockResolvedValue({});

      const result = await broadcastPromotion({
        promotionId: "promo_3",
        businessId: "biz_1",
        actorUserId: "user_1"
      });

      expect(prisma.promotion.update).toHaveBeenCalledWith({
        where: { id: "promo_3" },
        data: expect.objectContaining({
          broadcastSentBy: "user_1",
          broadcastAt: expect.any(Date)
        })
      });
      expect(prisma.staffAuditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: "promotion.broadcast",
          targetType: "Promotion",
          targetId: "promo_3",
          metadata: {
            recipientCount: 2,
            tierIds: [],
            failed: 1
          }
        })
      });
      expect(result).toMatchObject({
        recipientCount: 2,
        failedCount: 1
      });
    });

    it("rejects archived, future, ended, or already-broadcast promotions", async () => {
      mockManagerRole();

      prisma.promotion.findUniqueOrThrow.mockResolvedValueOnce({
        id: "promo_archived",
        businessId: "biz_1",
        title: "Archived",
        description: null,
        isActive: false,
        startsAt: new Date(Date.now() - 60_000),
        endsAt: new Date(Date.now() + 60_000),
        broadcastAt: null,
        targetTierIds: [],
        business: { id: "biz_1", slug: "acme", name: "Acme" }
      });
      await expect(
        broadcastPromotion({ promotionId: "promo_archived", businessId: "biz_1", actorUserId: "user_1" })
      ).rejects.toThrow(/archived promotions cannot be broadcast/i);

      prisma.promotion.findUniqueOrThrow.mockResolvedValueOnce({
        id: "promo_future",
        businessId: "biz_1",
        title: "Future",
        description: null,
        isActive: true,
        startsAt: new Date(Date.now() + 60_000),
        endsAt: new Date(Date.now() + 120_000),
        broadcastAt: null,
        targetTierIds: [],
        business: { id: "biz_1", slug: "acme", name: "Acme" }
      });
      await expect(
        broadcastPromotion({ promotionId: "promo_future", businessId: "biz_1", actorUserId: "user_1" })
      ).rejects.toThrow(/has not started yet/i);

      prisma.promotion.findUniqueOrThrow.mockResolvedValueOnce({
        id: "promo_ended",
        businessId: "biz_1",
        title: "Ended",
        description: null,
        isActive: true,
        startsAt: new Date(Date.now() - 120_000),
        endsAt: new Date(Date.now() - 60_000),
        broadcastAt: null,
        targetTierIds: [],
        business: { id: "biz_1", slug: "acme", name: "Acme" }
      });
      await expect(
        broadcastPromotion({ promotionId: "promo_ended", businessId: "biz_1", actorUserId: "user_1" })
      ).rejects.toThrow(/already ended/i);

      prisma.promotion.findUniqueOrThrow.mockResolvedValueOnce({
        id: "promo_sent",
        businessId: "biz_1",
        title: "Sent",
        description: null,
        isActive: true,
        startsAt: new Date(Date.now() - 60_000),
        endsAt: new Date(Date.now() + 60_000),
        broadcastAt: new Date(),
        targetTierIds: [],
        business: { id: "biz_1", slug: "acme", name: "Acme" }
      });
      await expect(
        broadcastPromotion({ promotionId: "promo_sent", businessId: "biz_1", actorUserId: "user_1" })
      ).rejects.toThrow(/already been broadcast/i);
    });
  });
});
