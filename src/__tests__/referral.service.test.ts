import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ------------------------------------------------------------------
// Shared in-memory mock
// ------------------------------------------------------------------
const referralDb: Record<
  string,
  { id: string; businessId: string; ownerUserId: string; code: string; isActive: boolean }
> = {};

const prisma = {
  referralCode: {
    findUnique: vi.fn(),
    upsert: vi.fn(),
    findFirst: vi.fn()
  },
  membership: {
    findUnique: vi.fn(),
    update: vi.fn()
  },
  loyaltyTransaction: {
    create: vi.fn()
  },
  notification: {
    create: vi.fn(),
    createMany: vi.fn().mockResolvedValue({ count: 1 })
  }
};

const withBusinessScope = vi.fn(async (_businessId: string, fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma));

vi.mock("@/lib/prisma", () => ({ prisma, withBusinessScope }));

const { getOrCreateReferralCode, resolveReferralCode, applyReferralRewardIfEligible } =
  await import("@/server/services/referral.service");

beforeEach(() => {
  vi.clearAllMocks();
  Object.keys(referralDb).forEach((k) => delete referralDb[k]);
});

// ------------------------------------------------------------------
describe("getOrCreateReferralCode", () => {
  it("returns an existing code without creating a new one", async () => {
    const existing = {
      id: "rc_1",
      businessId: "biz_1",
      ownerUserId: "user_1",
      code: "ABCD1234",
      isActive: true
    };
    prisma.referralCode.findUnique.mockResolvedValue(existing);

    const result = await getOrCreateReferralCode({
      businessId: "biz_1",
      ownerUserId: "user_1"
    });

    expect(result).toEqual(existing);
    expect(prisma.referralCode.upsert).not.toHaveBeenCalled();
  });

  it("creates a new code when none exists", async () => {
    prisma.referralCode.findUnique.mockResolvedValue(null);
    const newCode = {
      id: "rc_2",
      businessId: "biz_1",
      ownerUserId: "user_2",
      code: "XY3Z8P2Q",
      isActive: true
    };
    prisma.referralCode.upsert.mockResolvedValue(newCode);

    const result = await getOrCreateReferralCode({
      businessId: "biz_1",
      ownerUserId: "user_2"
    });

    expect(prisma.referralCode.upsert).toHaveBeenCalledOnce();
    expect(result.code).toHaveLength(8);
  });

  it("retries on a P2002 unique-code collision and succeeds on the second attempt", async () => {
    prisma.referralCode.findUnique.mockResolvedValue(null);

    const p2002 = new Prisma.PrismaClientKnownRequestError(
      "Unique constraint violation",
      { code: "P2002", clientVersion: "5.0.0", meta: {} }
    );
    prisma.referralCode.upsert
      .mockRejectedValueOnce(p2002)
      .mockResolvedValueOnce({
        id: "rc_3",
        businessId: "biz_1",
        ownerUserId: "user_3",
        code: "RETRY456",
        isActive: true
      });

    const result = await getOrCreateReferralCode({
      businessId: "biz_1",
      ownerUserId: "user_3"
    });

    expect(prisma.referralCode.upsert).toHaveBeenCalledTimes(2);
    expect(result.code).toBe("RETRY456");
  });

  it("propagates non-P2002 errors immediately", async () => {
    prisma.referralCode.findUnique.mockResolvedValue(null);
    prisma.referralCode.upsert.mockRejectedValue(new Error("DB connection lost"));

    await expect(
      getOrCreateReferralCode({ businessId: "biz_1", ownerUserId: "user_4" })
    ).rejects.toThrow("DB connection lost");

    expect(prisma.referralCode.upsert).toHaveBeenCalledTimes(1);
  });
});

// ------------------------------------------------------------------
describe("resolveReferralCode", () => {
  it("returns null for an empty or whitespace-only code", async () => {
    const result = await resolveReferralCode({
      businessId: "biz_1",
      code: "  ",
      referredUserId: "user_A"
    });
    expect(result).toBeNull();
    expect(prisma.referralCode.findFirst).not.toHaveBeenCalled();
  });

  it("normalises the code to upper-case before lookup", async () => {
    prisma.referralCode.findFirst.mockResolvedValue(null);

    await resolveReferralCode({
      businessId: "biz_1",
      code: "abc12345",
      referredUserId: "user_A"
    });

    expect(prisma.referralCode.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ code: "ABC12345" })
      })
    );
  });

  it("returns null when the code does not exist", async () => {
    prisma.referralCode.findFirst.mockResolvedValue(null);

    const result = await resolveReferralCode({
      businessId: "biz_1",
      code: "NOTFOUND",
      referredUserId: "user_A"
    });

    expect(result).toBeNull();
  });

  it("prevents self-referral: returns null when the referredUserId owns the code", async () => {
    prisma.referralCode.findFirst.mockResolvedValue({
      id: "rc_self",
      businessId: "biz_1",
      ownerUserId: "user_SELF",
      code: "SELFREF1",
      isActive: true
    });

    const result = await resolveReferralCode({
      businessId: "biz_1",
      code: "SELFREF1",
      referredUserId: "user_SELF"
    });

    expect(result).toBeNull();
  });

  it("returns the referral code when valid and not a self-referral", async () => {
    const rc = {
      id: "rc_valid",
      businessId: "biz_1",
      ownerUserId: "user_REFERRER",
      code: "VALIDREF",
      isActive: true
    };
    prisma.referralCode.findFirst.mockResolvedValue(rc);

    const result = await resolveReferralCode({
      businessId: "biz_1",
      code: "VALIDREF",
      referredUserId: "user_NEW"
    });

    expect(result).toEqual(rc);
  });
});

// ------------------------------------------------------------------
describe("applyReferralRewardIfEligible", () => {
  const tx = prisma as unknown as Parameters<typeof applyReferralRewardIfEligible>[0];

  it("returns null when the membership has no referral code", async () => {
    prisma.membership.findUnique.mockResolvedValue({
      id: "mem_1",
      referredByCodeId: null,
      referralRewardedAt: null,
      referredByCode: null
    });

    const result = await applyReferralRewardIfEligible(tx, { membershipId: "mem_1" });
    expect(result).toBeNull();
  });

  it("returns null when the referral reward was already applied", async () => {
    prisma.membership.findUnique.mockResolvedValue({
      id: "mem_1",
      referredByCodeId: "rc_1",
      referralRewardedAt: new Date(),
      referredByCode: { id: "rc_1", ownerUserId: "user_REFERRER", code: "ABCD1234" }
    });

    const result = await applyReferralRewardIfEligible(tx, { membershipId: "mem_1" });
    expect(result).toBeNull();
  });

  it("returns null when the referrer has no membership in this business", async () => {
    prisma.membership.findUnique
      .mockResolvedValueOnce({
        id: "mem_1",
        referredByCodeId: "rc_1",
        referralRewardedAt: null,
        businessId: "biz_1",
        referredByCode: { id: "rc_1", ownerUserId: "user_REFERRER", code: "ABCD1234" },
        business: { id: "biz_1", name: "Acme", slug: "acme", loyaltySignupBonus: 0 }
      })
      .mockResolvedValueOnce(null);

    const result = await applyReferralRewardIfEligible(tx, { membershipId: "mem_1" });
    expect(result).toBeNull();
  });

  it("awards points to the referrer and stamps referralRewardedAt on the referee", async () => {
    prisma.membership.findUnique
      .mockResolvedValueOnce({
        id: "mem_REFEREE",
        businessId: "biz_1",
        userId: "user_NEW",
        referredByCodeId: "rc_1",
        referralRewardedAt: null,
        referredByCode: { id: "rc_1", ownerUserId: "user_REFERRER", code: "ABCD1234" },
        business: { id: "biz_1", name: "Acme", slug: "acme", loyaltySignupBonus: 0 }
      })
      .mockResolvedValueOnce({
        id: "mem_REFERRER",
        businessId: "biz_1",
        userId: "user_REFERRER",
        pointsBalance: 100,
        isActive: true
      });

    prisma.membership.update.mockResolvedValue({});
    prisma.loyaltyTransaction.create.mockResolvedValue({ id: "tx_ref" });
    prisma.notification.create.mockResolvedValue({});

    const result = await applyReferralRewardIfEligible(tx, { membershipId: "mem_REFEREE" });

    expect(result).not.toBeNull();
    expect(result?.points).toBe(50);
    expect(prisma.membership.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "mem_REFERRER" },
        data: { pointsBalance: { increment: 50 } }
      })
    );
    expect(prisma.membership.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "mem_REFEREE" },
        data: expect.objectContaining({ referralRewardedAt: expect.any(Date) })
      })
    );
  });
});
