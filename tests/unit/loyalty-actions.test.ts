import { describe, expect, it, vi } from "vitest";

const BIZ_A = "biz_a";
const BIZ_B = "biz_b";
const MEM_A = "mem_a";
const TX_A = "tx_earn_a";
const TX_B = "tx_earn_b";
const ACTOR = "user_manager_a";

const membership = {
  id: MEM_A,
  businessId: BIZ_A,
  userId: "customer_1",
  pointsBalance: 500,
  isActive: true,
  tierId: null,
  user: { id: "customer_1", name: "Customer One", phone: "+27821000001" },
  business: { id: BIZ_A, name: "Biz A", slug: "biz-a", isActive: true, deletedAt: null, loyaltyTiers: [] }
};

const txA = {
  id: TX_A,
  businessId: BIZ_A,
  membershipId: MEM_A,
  type: "EARN" as const,
  pointsDelta: 100,
  description: "Earn",
  expiresAt: null,
  refundSourceId: null,
  expirySourceId: null,
  refundTarget: null,
  expiryTarget: null,
  membership: {
    ...membership,
    pointsBalance: 200,
    business: { ...membership.business, loyaltyTiers: [] }
  }
};

const txB = {
  id: TX_B,
  businessId: BIZ_B,
  membershipId: "mem_b",
  type: "EARN" as const,
  pointsDelta: 50,
  description: "Earn B",
  expiresAt: null,
  refundSourceId: null,
  expirySourceId: null,
  refundTarget: null,
  expiryTarget: null,
  membership: {
    ...membership,
    id: "mem_b",
    businessId: BIZ_B,
    business: { ...membership.business, id: BIZ_B, loyaltyTiers: [] }
  }
};

const findTxMock = vi.fn();

const txClient = {
  membership: {
    findUniqueOrThrow: vi.fn().mockResolvedValue(membership),
    update: vi.fn().mockResolvedValue(membership)
  },
  loyaltyTransaction: {
    findUniqueOrThrow: findTxMock,
    create: vi.fn().mockResolvedValue({ id: "tx_refund" }),
    findMany: vi.fn().mockResolvedValue([]),
    updateMany: vi.fn().mockResolvedValue({ count: 0 })
  },
  reward: { findFirstOrThrow: vi.fn(), update: vi.fn() },
  staffAuditLog: { create: vi.fn() },
  notification: {
    create: vi.fn().mockResolvedValue({ id: "notif_1" }),
    createMany: vi.fn().mockResolvedValue({ count: 1 })
  },
  pushSubscription: { findMany: vi.fn().mockResolvedValue([]) }
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    membership: {
      findUniqueOrThrow: vi.fn().mockResolvedValue(membership),
      update: vi.fn().mockResolvedValue(membership)
    },
    loyaltyTransaction: {
      findUniqueOrThrow: findTxMock,
      create: vi.fn().mockResolvedValue({ id: "tx_refund" }),
      findMany: vi.fn().mockResolvedValue([])
    },
    $transaction: vi.fn().mockImplementation((fn: (tx: unknown) => Promise<unknown>) => {
      return fn(txClient);
    })
  },
  withBusinessScope: vi.fn().mockImplementation(
    async (_businessId: string, fn: (tx: typeof txClient) => Promise<unknown>) => fn(txClient)
  )
}));

vi.mock("@/lib/staff", () => ({
  requireRole: vi.fn().mockResolvedValue(undefined)
}));

// Return null so runIdempotentOperation uses its safe in-memory fallback.
vi.mock("@/lib/redis", () => ({
  getRedis: () => null
}));

vi.mock("@/server/services/staff-audit.service", () => ({
  recordStaffAuditLog: vi.fn().mockResolvedValue(undefined)
}));

const { refundTransaction } = await import("@/server/services/loyalty.service");

describe("refundTransaction — cross-tenant IDOR guard", () => {
  it("throws when the transaction belongs to a different business", async () => {
    // Tx belongs to BIZ_B but actor claims BIZ_A
    findTxMock.mockResolvedValueOnce(txB);

    await expect(
      refundTransaction({
        businessId: BIZ_A,
        transactionId: TX_B,
        actorUserId: ACTOR,
        idempotencyKey: "idem_cross_tenant_test"
      })
    ).rejects.toThrow("Transaction does not belong to this business.");
  });

  it("allows refund when transaction belongs to the correct business", async () => {
    findTxMock.mockResolvedValueOnce(txA);

    await expect(
      refundTransaction({
        businessId: BIZ_A,
        transactionId: TX_A,
        actorUserId: ACTOR,
        idempotencyKey: "idem_valid_refund"
      })
    ).resolves.toBeDefined();
  });

  it("throws when transaction type is REFUND (non-refundable)", async () => {
    findTxMock.mockResolvedValueOnce({
      ...txA,
      type: "REFUND"
    });

    await expect(
      refundTransaction({
        businessId: BIZ_A,
        transactionId: TX_A,
        actorUserId: ACTOR,
        idempotencyKey: "idem_refund_type"
      })
    ).rejects.toThrow("cannot be refunded");
  });

  it("throws when transaction is already refunded", async () => {
    findTxMock.mockResolvedValueOnce({
      ...txA,
      refundTarget: { id: "tx_existing_refund" }
    });

    await expect(
      refundTransaction({
        businessId: BIZ_A,
        transactionId: TX_A,
        actorUserId: ACTOR,
        idempotencyKey: "idem_double_refund"
      })
    ).rejects.toThrow("already been refunded");
  });
});
