import { TransactionType } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ------------------------------------------------------------------
// Shared in-memory Prisma mock
// ------------------------------------------------------------------
const prisma = {
  $transaction: vi.fn(),
  membership: {
    findUniqueOrThrow: vi.fn(),
    update: vi.fn(),
    findMany: vi.fn()
  },
  loyaltyTransaction: {
    create: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    findFirstOrThrow: vi.fn(),
    findMany: vi.fn()
  },
  reward: {
    findFirstOrThrow: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn()
  },
  notification: {
    create: vi.fn(),
    createMany: vi.fn().mockResolvedValue({ count: 1 })
  },
  staffAuditLog: {
    create: vi.fn()
  }
};

const redisMock = {
  set: vi.fn().mockResolvedValue("OK"),
  get: vi.fn().mockResolvedValue(null),
  del: vi.fn().mockResolvedValue(1),
  exists: vi.fn().mockResolvedValue(0),
  setnx: vi.fn().mockResolvedValue(1),
  expire: vi.fn().mockResolvedValue(1)
};

const withBusinessScope = vi.fn(async (_businessId: string, fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma));

vi.mock("@/lib/prisma", () => ({ prisma, withBusinessScope }));
vi.mock("@/lib/redis", () => ({ getRedis: () => redisMock }));
vi.mock("@/server/services/referral.service", () => ({
  applyReferralRewardIfEligible: vi.fn().mockResolvedValue(null)
}));
vi.mock("@/server/services/staff-audit.service", () => ({
  recordStaffAuditLog: vi.fn().mockResolvedValue(undefined)
}));

const { earnPoints, redeemPoints, refundTransaction } = await import(
  "@/server/services/loyalty.service"
);

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

function makeMembership(overrides: Partial<{
  id: string;
  businessId: string;
  userId: string;
  pointsBalance: number;
  tierId: string | null;
  isActive: boolean;
}> = {}) {
  return {
    id: "mem_1",
    businessId: "biz_1",
    userId: "user_1",
    pointsBalance: 200,
    tierId: null,
    isActive: true,
    referredByCodeId: null,
    referralRewardedAt: null,
    referredByCode: null,
    tier: null,
    user: { id: "user_1", name: "Alice" },
    business: {
      id: "biz_1",
      name: "Acme",
      slug: "acme",
      loyaltySignupBonus: 0,
      pointsExpiryDays: 365,
      loyaltyTiers: []
    },
    ...overrides
  };
}

function buildTransaction() {
  prisma.$transaction.mockImplementation(
    async (fn: (tx: typeof prisma) => unknown, _opts?: unknown) => fn(prisma)
  );
}

// Idempotency: make Redis lock always succeed and not replay
redisMock.setnx.mockResolvedValue(1);
redisMock.exists.mockResolvedValue(0);

// ------------------------------------------------------------------
beforeEach(() => {
  vi.clearAllMocks();
  buildTransaction();
  redisMock.setnx.mockResolvedValue(1);
  redisMock.exists.mockResolvedValue(0);
  redisMock.get.mockResolvedValue(null);
});

// ------------------------------------------------------------------
describe("earnPoints", () => {
  it("rejects non-positive point values", async () => {
    await expect(
      earnPoints({
        businessId: "biz_1",
        membershipId: "mem_1",
        points: 0,
        actorUserId: "staff_1",
        idempotencyKey: "idem_1"
      })
    ).rejects.toThrow(/greater than zero/i);

    expect(prisma.membership.findUniqueOrThrow).not.toHaveBeenCalled();
  });

  it("rejects when the membership belongs to a different business", async () => {
    prisma.membership.findUniqueOrThrow.mockResolvedValue(
      makeMembership({ businessId: "biz_OTHER" })
    );

    await expect(
      earnPoints({
        businessId: "biz_1",
        membershipId: "mem_1",
        points: 50,
        actorUserId: "staff_1",
        idempotencyKey: "idem_2"
      })
    ).rejects.toThrow(/does not belong/i);
  });

  it("increments pointsBalance and creates a EARN transaction", async () => {
    const membership = makeMembership();
    prisma.membership.findUniqueOrThrow.mockResolvedValue(membership);
    prisma.membership.update.mockResolvedValue({ ...membership, pointsBalance: 250 });
    prisma.loyaltyTransaction.create.mockResolvedValue({ id: "tx_1" });
    prisma.notification.create.mockResolvedValue({});

    await earnPoints({
      businessId: "biz_1",
      membershipId: "mem_1",
      points: 50,
      actorUserId: "staff_1",
      idempotencyKey: "idem_3"
    });

    expect(prisma.membership.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { pointsBalance: { increment: 50 } }
      })
    );
    expect(prisma.loyaltyTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: TransactionType.EARN,
          pointsDelta: 50
        })
      })
    );
  });
});

// ------------------------------------------------------------------
describe("redeemPoints", () => {
  it("rejects when the member has insufficient balance", async () => {
    const membership = makeMembership({ pointsBalance: 30 });
    prisma.membership.findUniqueOrThrow.mockResolvedValue(membership);

    await expect(
      redeemPoints({
        businessId: "biz_1",
        membershipId: "mem_1",
        actorUserId: "user_1",
        idempotencyKey: "idem_r1",
        points: 100
      })
    ).rejects.toThrow(/insufficient/i);

    expect(prisma.membership.update).not.toHaveBeenCalled();
  });

  it("decrements balance and records a REDEEM transaction for a direct point redemption", async () => {
    const membership = makeMembership({ pointsBalance: 200 });
    prisma.membership.findUniqueOrThrow.mockResolvedValue(membership);
    prisma.membership.update.mockResolvedValue({ ...membership, pointsBalance: 100 });
    prisma.loyaltyTransaction.create.mockResolvedValue({ id: "tx_r1" });
    prisma.notification.create.mockResolvedValue({});

    await redeemPoints({
      businessId: "biz_1",
      membershipId: "mem_1",
      actorUserId: "user_1",
      idempotencyKey: "idem_r2",
      points: 100
    });

    expect(prisma.membership.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { pointsBalance: { decrement: 100 } }
      })
    );
    expect(prisma.loyaltyTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: TransactionType.REDEEM,
          pointsDelta: -100
        })
      })
    );
  });

  it("decrements reward stock when redeeming via a reward", async () => {
    const membership = makeMembership({ pointsBalance: 500 });
    prisma.membership.findUniqueOrThrow.mockResolvedValue(membership);

    const reward = { id: "rwd_1", title: "Coffee", pointsCost: 200, isActive: true, stock: 5, businessId: "biz_1" };
    prisma.reward.findFirstOrThrow.mockResolvedValue(reward);
    prisma.reward.updateMany.mockResolvedValue({ count: 1 });
    prisma.membership.update.mockResolvedValue({ ...membership, pointsBalance: 300 });
    prisma.loyaltyTransaction.create.mockResolvedValue({ id: "tx_r3" });
    prisma.notification.create.mockResolvedValue({});

    await redeemPoints({
      businessId: "biz_1",
      membershipId: "mem_1",
      actorUserId: "user_1",
      idempotencyKey: "idem_r3",
      rewardId: "rwd_1"
    });

    expect(prisma.reward.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "rwd_1", stock: { gt: 0 } }),
        data: { stock: { decrement: 1 } }
      })
    );
  });

  it("rejects when the reward is out of stock", async () => {
    const membership = makeMembership({ pointsBalance: 500 });
    prisma.membership.findUniqueOrThrow.mockResolvedValue(membership);

    prisma.reward.findFirstOrThrow.mockResolvedValue({
      id: "rwd_2",
      title: "Hat",
      pointsCost: 100,
      isActive: true,
      stock: 0,
      businessId: "biz_1"
    });
    // updateMany returns count: 0 when no rows matched (stock was already 0).
    prisma.reward.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      redeemPoints({
        businessId: "biz_1",
        membershipId: "mem_1",
        actorUserId: "user_1",
        idempotencyKey: "idem_r4",
        rewardId: "rwd_2"
      })
    ).rejects.toThrow(/out of stock/i);
  });
});

// ------------------------------------------------------------------
describe("refundTransaction", () => {
  it("rejects when the transaction belongs to a different business", async () => {
    prisma.loyaltyTransaction.findUniqueOrThrow.mockResolvedValue({
      id: "tx_1",
      businessId: "biz_OTHER",
      type: TransactionType.EARN,
      pointsDelta: 100,
      description: "Earn",
      refundTarget: null,
      membershipId: "mem_1",
      membership: {
        id: "mem_1",
        businessId: "biz_OTHER",
        pointsBalance: 100,
        user: { id: "user_1" },
        business: { name: "Other", slug: "other" }
      }
    });

    await expect(
      refundTransaction({
        businessId: "biz_1",
        transactionId: "tx_1",
        actorUserId: "staff_1",
        idempotencyKey: "idem_rf1"
      })
    ).rejects.toThrow(/does not belong/i);
  });

  it("rejects when the transaction type cannot be refunded", async () => {
    prisma.loyaltyTransaction.findUniqueOrThrow.mockResolvedValue({
      id: "tx_2",
      businessId: "biz_1",
      type: TransactionType.REFUND,
      pointsDelta: -50,
      description: "Refund",
      refundTarget: null,
      membershipId: "mem_1",
      membership: {
        id: "mem_1",
        businessId: "biz_1",
        pointsBalance: 150,
        user: { id: "user_1" },
        business: { name: "Acme", slug: "acme" }
      }
    });

    await expect(
      refundTransaction({
        businessId: "biz_1",
        transactionId: "tx_2",
        actorUserId: "staff_1",
        idempotencyKey: "idem_rf2"
      })
    ).rejects.toThrow(/cannot be refunded/i);
  });

  it("rejects a double-refund attempt", async () => {
    prisma.loyaltyTransaction.findUniqueOrThrow.mockResolvedValue({
      id: "tx_3",
      businessId: "biz_1",
      type: TransactionType.EARN,
      pointsDelta: 100,
      description: "Earn",
      refundTarget: { id: "tx_refund_3" },
      membershipId: "mem_1",
      membership: {
        id: "mem_1",
        businessId: "biz_1",
        pointsBalance: 200,
        user: { id: "user_1" },
        business: { name: "Acme", slug: "acme" }
      }
    });

    await expect(
      refundTransaction({
        businessId: "biz_1",
        transactionId: "tx_3",
        actorUserId: "staff_1",
        idempotencyKey: "idem_rf3"
      })
    ).rejects.toThrow(/already been refunded/i);
  });

  it("rejects when the member balance would go negative after refund", async () => {
    prisma.loyaltyTransaction.findUniqueOrThrow.mockResolvedValue({
      id: "tx_4",
      businessId: "biz_1",
      type: TransactionType.EARN,
      pointsDelta: 500,
      description: "Big earn",
      refundTarget: null,
      membershipId: "mem_1",
      membership: {
        id: "mem_1",
        businessId: "biz_1",
        pointsBalance: 50,
        user: { id: "user_1" },
        business: { name: "Acme", slug: "acme" }
      }
    });

    await expect(
      refundTransaction({
        businessId: "biz_1",
        transactionId: "tx_4",
        actorUserId: "staff_1",
        idempotencyKey: "idem_rf4"
      })
    ).rejects.toThrow(/enough remaining points/i);
  });

  it("creates a REFUND transaction and restores the balance", async () => {
    prisma.loyaltyTransaction.findUniqueOrThrow.mockResolvedValue({
      id: "tx_5",
      businessId: "biz_1",
      type: TransactionType.EARN,
      pointsDelta: 100,
      description: "Earn",
      refundTarget: null,
      membershipId: "mem_1",
      metadata: {},
      membership: {
        id: "mem_1",
        businessId: "biz_1",
        pointsBalance: 200,
        userId: "user_1",
        user: { id: "user_1" },
        business: { id: "biz_1", name: "Acme", slug: "acme", loyaltyTiers: [] },
        tierId: null,
        tier: null
      }
    });

    prisma.membership.findUniqueOrThrow.mockResolvedValue(makeMembership());
    prisma.membership.update.mockResolvedValue(makeMembership({ pointsBalance: 100 }));
    prisma.loyaltyTransaction.create.mockResolvedValue({ id: "tx_refund_5" });
    prisma.notification.create.mockResolvedValue({});

    await refundTransaction({
      businessId: "biz_1",
      transactionId: "tx_5",
      actorUserId: "staff_1",
      idempotencyKey: "idem_rf5"
    });

    expect(prisma.membership.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { pointsBalance: { increment: -100 } }
      })
    );
    expect(prisma.loyaltyTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: TransactionType.REFUND,
          pointsDelta: -100,
          refundSourceId: "tx_5"
        })
      })
    );
  });
});

// ------------------------------------------------------------------
describe("redeemPoints — concurrent last-reward-stock scenarios", () => {
  it("throws OUT_OF_STOCK when reward.stock is 0", async () => {
    prisma.membership.findUniqueOrThrow.mockResolvedValue(makeMembership({ pointsBalance: 500 }));
    prisma.reward.findFirstOrThrow.mockResolvedValue({
      id: "reward_ltd",
      businessId: "biz_1",
      title: "Last One",
      pointsCost: 100,
      isActive: true,
      stock: 0
    });
    // stock > 0 condition not met; updateMany matches 0 rows.
    prisma.reward.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      redeemPoints({
        businessId: "biz_1",
        membershipId: "mem_1",
        rewardId: "reward_ltd",
        actorUserId: "user_1",
        idempotencyKey: "idem_oos_1"
      })
    ).rejects.toThrow(/out of stock/i);

    expect(prisma.loyaltyTransaction.create).not.toHaveBeenCalled();
  });

  it("succeeds and decrements stock when reward.stock is 1", async () => {
    prisma.membership.findUniqueOrThrow.mockResolvedValue(makeMembership({ pointsBalance: 500 }));
    prisma.reward.findFirstOrThrow.mockResolvedValue({
      id: "reward_ltd2",
      businessId: "biz_1",
      title: "Almost Gone",
      pointsCost: 50,
      isActive: true,
      stock: 1
    });
    // Exactly one row matched the stock > 0 condition.
    prisma.reward.updateMany.mockResolvedValue({ count: 1 });
    prisma.membership.update.mockResolvedValue(makeMembership({ pointsBalance: 450 }));
    prisma.loyaltyTransaction.create.mockResolvedValue({ id: "tx_redeem_stock" });
    prisma.notification.create.mockResolvedValue({});

    await redeemPoints({
      businessId: "biz_1",
      membershipId: "mem_1",
      rewardId: "reward_ltd2",
      actorUserId: "user_1",
      idempotencyKey: "idem_oos_2"
    });

    expect(prisma.reward.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "reward_ltd2", stock: { gt: 0 } }),
        data: { stock: { decrement: 1 } }
      })
    );
  });

  it("does not decrement stock when reward.stock is null (unlimited)", async () => {
    prisma.membership.findUniqueOrThrow.mockResolvedValue(makeMembership({ pointsBalance: 500 }));
    prisma.reward.findFirstOrThrow.mockResolvedValue({
      id: "reward_unlimited",
      businessId: "biz_1",
      title: "Unlimited",
      pointsCost: 50,
      isActive: true,
      stock: null
    });
    prisma.membership.update.mockResolvedValue(makeMembership({ pointsBalance: 450 }));
    prisma.loyaltyTransaction.create.mockResolvedValue({ id: "tx_redeem_unlimited" });
    prisma.notification.create.mockResolvedValue({});

    await redeemPoints({
      businessId: "biz_1",
      membershipId: "mem_1",
      rewardId: "reward_unlimited",
      actorUserId: "user_1",
      idempotencyKey: "idem_oos_3"
    });

    // Null stock means unlimited — no stock update should occur.
    expect(prisma.reward.update).not.toHaveBeenCalled();
    expect(prisma.reward.updateMany).not.toHaveBeenCalled();
  });
});
