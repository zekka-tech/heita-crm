import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {
    membership: {
      findUnique: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn()
    },
    business: {
      findUniqueOrThrow: vi.fn()
    },
    loyaltyTransaction: {
      create: vi.fn()
    },
    notification: {
      create: vi.fn(),
      createMany: vi.fn().mockResolvedValue({ count: 1 })
    }
  },
  captureEvent: vi.fn(),
  resolveReferralCode: vi.fn(),
  withBusinessScope: vi.fn()
}));

vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma, withBusinessScope: mocks.withBusinessScope }));
vi.mock("@/lib/telemetry", () => ({ captureEvent: mocks.captureEvent }));
vi.mock("@/server/services/referral.service", () => ({ resolveReferralCode: mocks.resolveReferralCode }));

const { getCustomersSearch, joinBusiness } = await import("@/server/services/membership.service");
const { TELEMETRY_EVENTS } = await import("@/lib/telemetry-events");
const { JoinChannel } = await import("@prisma/client");

const business = {
  id: "biz_1",
  name: "Acme",
  slug: "acme",
  loyaltySignupBonus: 100,
  pointsExpiryDays: 365,
  loyaltyTiers: []
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.withBusinessScope.mockImplementation(async (_businessId: string, fn: (tx: typeof mocks.prisma) => Promise<unknown>) => fn(mocks.prisma));
  mocks.prisma.business.findUniqueOrThrow.mockResolvedValue(business);
  mocks.prisma.membership.create.mockResolvedValue({
    id: "mem_1",
    businessId: "biz_1",
    userId: "user_1"
  });
  mocks.resolveReferralCode.mockResolvedValue(null);
});

describe("joinBusiness telemetry", () => {
  it("captures business_joined and membership.joined after a new membership is created", async () => {
    mocks.prisma.membership.findUnique.mockResolvedValue(null);

    await expect(joinBusiness({
      businessId: "biz_1",
      userId: "user_1",
      joinChannel: JoinChannel.QR_CODE,
      referralCode: null
    })).resolves.toEqual(expect.objectContaining({ id: "mem_1" }));

    expect(mocks.captureEvent).toHaveBeenNthCalledWith(1, {
      userId: "user_1",
      event: TELEMETRY_EVENTS.businessJoined,
      properties: {
        businessId: "biz_1",
        joinChannel: JoinChannel.QR_CODE,
        referralUsed: false,
        signupBonusPoints: 100
      }
    });
    expect(mocks.captureEvent).toHaveBeenNthCalledWith(2, {
      userId: "user_1",
      event: TELEMETRY_EVENTS.membershipJoined,
      properties: {
        businessId: "biz_1",
        joinChannel: JoinChannel.QR_CODE,
        referralUsed: false,
        signupBonusPoints: 100
      }
    });
  });

  it("includes lead-source attribution in the join telemetry when provided", async () => {
    mocks.prisma.membership.findUnique.mockResolvedValue(null);

    await joinBusiness({
      businessId: "biz_1",
      userId: "user_1",
      joinChannel: JoinChannel.DIRECT_LINK,
      referralCode: null,
      attribution: { leadSource: "google", leadMedium: "cpc", leadCampaign: "winter-sale" }
    });

    expect(mocks.captureEvent).toHaveBeenNthCalledWith(1, {
      userId: "user_1",
      event: TELEMETRY_EVENTS.businessJoined,
      properties: {
        businessId: "biz_1",
        joinChannel: JoinChannel.DIRECT_LINK,
        referralUsed: false,
        signupBonusPoints: 100,
        leadSource: "google",
        leadMedium: "cpc",
        leadCampaign: "winter-sale"
      }
    });
  });

  it("does not capture membership.joined when the membership already exists", async () => {
    mocks.prisma.membership.findUnique.mockResolvedValue({
      id: "mem_existing",
      businessId: "biz_1",
      userId: "user_1"
    });

    await expect(joinBusiness({
      businessId: "biz_1",
      userId: "user_1",
      joinChannel: JoinChannel.QR_CODE
    })).resolves.toEqual(expect.objectContaining({ id: "mem_existing" }));

    expect(mocks.prisma.membership.create).not.toHaveBeenCalled();
    expect(mocks.captureEvent).not.toHaveBeenCalled();
  });
});


describe("getCustomersSearch", () => {
  it("returns empty results without opening a tenant scope for blank queries", async () => {
    await expect(getCustomersSearch("biz_1", "   ")).resolves.toEqual([]);
    expect(mocks.withBusinessScope).not.toHaveBeenCalled();
    expect(mocks.prisma.membership.findMany).not.toHaveBeenCalled();
  });

  it("searches active members inside the requested business scope", async () => {
    mocks.prisma.membership.findMany.mockResolvedValue([
      { id: "mem_1", user: { id: "user_1", name: "Ava", phone: "+27820000000" } }
    ]);

    await expect(getCustomersSearch("biz_1", "Ava")).resolves.toHaveLength(1);

    expect(mocks.withBusinessScope).toHaveBeenCalledWith("biz_1", expect.any(Function));
    expect(mocks.prisma.membership.findMany).toHaveBeenCalledWith({
      where: {
        businessId: "biz_1",
        isActive: true,
        user: {
          deletedAt: null,
          OR: [
            { phone: { contains: "Ava" } },
            { name: { contains: "Ava", mode: "insensitive" } }
          ]
        }
      },
      include: {
        user: { select: { id: true, name: true, phone: true } }
      },
      orderBy: { joinedAt: "desc" },
      take: 20
    });
  });
});
