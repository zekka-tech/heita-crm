import { beforeEach, describe, expect, it, vi } from "vitest";

const prisma = {
  business: { findFirst: vi.fn() }
};

vi.mock("@/lib/prisma", () => ({ prisma }));

const { findPublicBusinessIdentityBySlug } = await import(
  "@/server/services/public-business.service"
);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("findPublicBusinessIdentityBySlug", () => {
  it("selects only public identity fields for active, non-deleted businesses", async () => {
    prisma.business.findFirst.mockResolvedValue({ id: "biz_1", name: "Demo Shop" });

    await expect(findPublicBusinessIdentityBySlug("demo-shop")).resolves.toEqual({
      id: "biz_1",
      name: "Demo Shop"
    });

    expect(prisma.business.findFirst).toHaveBeenCalledWith({
      where: { slug: "demo-shop", deletedAt: null, isActive: true },
      select: { id: true, name: true }
    });
  });

  it("rejects blank slugs before querying", async () => {
    await expect(findPublicBusinessIdentityBySlug("   ")).resolves.toBeNull();
    expect(prisma.business.findFirst).not.toHaveBeenCalled();
  });
});
