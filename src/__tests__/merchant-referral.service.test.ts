import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  tx: {
    merchantReferralCode: { findUnique: vi.fn(), findFirst: vi.fn(), upsert: vi.fn() },
    merchantReferral: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn(), findMany: vi.fn() },
    merchantCreditLedger: { create: vi.fn() },
    staffMember: { findFirst: vi.fn() },
    notification: { create: vi.fn() }
  },
  withSystemScope: vi.fn()
}));

vi.mock("@/lib/prisma", () => ({ withSystemScope: mocks.withSystemScope }));
vi.mock("@/lib/env", () => ({ env: { MERCHANT_REFERRAL_REWARD_ZAR: 500 } }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const { captureMerchantReferral, settleMerchantReferralForReferred } = await import(
  "@/server/services/merchant-referral.service"
);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.withSystemScope.mockImplementation(async (fn: (tx: typeof mocks.tx) => Promise<unknown>) =>
    fn(mocks.tx)
  );
});

describe("captureMerchantReferral", () => {
  it("creates a referral for a valid code", async () => {
    mocks.tx.merchantReferralCode.findFirst.mockResolvedValue({ id: "code1", ownerBusinessId: "ref_biz" });
    mocks.tx.merchantReferral.create.mockResolvedValue({ id: "mr1" });

    const result = await captureMerchantReferral({ codeValue: "abc123", referredBusinessId: "new_biz" });
    expect(result).toEqual({ id: "mr1" });
    expect(mocks.tx.merchantReferral.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { codeId: "code1", referrerBusinessId: "ref_biz", referredBusinessId: "new_biz" }
      })
    );
  });

  it("returns null for an unknown/inactive code", async () => {
    mocks.tx.merchantReferralCode.findFirst.mockResolvedValue(null);
    await expect(
      captureMerchantReferral({ codeValue: "nope", referredBusinessId: "new_biz" })
    ).resolves.toBeNull();
    expect(mocks.tx.merchantReferral.create).not.toHaveBeenCalled();
  });

  it("refuses self-referral", async () => {
    mocks.tx.merchantReferralCode.findFirst.mockResolvedValue({ id: "code1", ownerBusinessId: "same_biz" });
    await expect(
      captureMerchantReferral({ codeValue: "abc123", referredBusinessId: "same_biz" })
    ).resolves.toBeNull();
    expect(mocks.tx.merchantReferral.create).not.toHaveBeenCalled();
  });

  it("ignores a blank code", async () => {
    await expect(
      captureMerchantReferral({ codeValue: "   ", referredBusinessId: "new_biz" })
    ).resolves.toBeNull();
    expect(mocks.withSystemScope).not.toHaveBeenCalled();
  });
});

describe("settleMerchantReferralForReferred", () => {
  it("rewards a pending referral: marks REWARDED, credits referrer, notifies owner", async () => {
    mocks.tx.merchantReferral.findUnique.mockResolvedValue({
      id: "mr1",
      status: "PENDING",
      referrerBusinessId: "ref_biz",
      referrerBusiness: { id: "ref_biz", name: "Referrer Co" }
    });
    mocks.tx.staffMember.findFirst.mockResolvedValue({ userId: "owner_1" });

    const result = await settleMerchantReferralForReferred("new_biz");
    expect(result).toMatchObject({ referrerBusinessId: "ref_biz", rewardZar: 500 });
    expect(mocks.tx.merchantReferral.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "REWARDED", rewardAmountZar: 500 }) })
    );
    expect(mocks.tx.merchantCreditLedger.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ businessId: "ref_biz", amountZar: 500, type: "REFERRAL_REWARD" })
      })
    );
    expect(mocks.tx.notification.create).toHaveBeenCalled();
  });

  it("is a no-op when there is no pending referral", async () => {
    mocks.tx.merchantReferral.findUnique.mockResolvedValue({ id: "mr1", status: "REWARDED" });
    await expect(settleMerchantReferralForReferred("new_biz")).resolves.toBeNull();
    expect(mocks.tx.merchantCreditLedger.create).not.toHaveBeenCalled();
  });

  it("returns null when the referred business was never referred", async () => {
    mocks.tx.merchantReferral.findUnique.mockResolvedValue(null);
    await expect(settleMerchantReferralForReferred("new_biz")).resolves.toBeNull();
  });
});
