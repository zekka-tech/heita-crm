import { beforeEach, describe, expect, it, vi } from "vitest";

const prisma = {
  user: {
    update: vi.fn(),
    findUnique: vi.fn()
  }
};

vi.mock("@/lib/prisma", () => ({ prisma }));

const { revokeAllSessions, getCurrentSessionVersion } = await import(
  "@/server/services/session.service"
);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("revokeAllSessions", () => {
  it("increments sessionVersion by 1 and returns the new version", async () => {
    prisma.user.update.mockResolvedValue({ sessionVersion: 3 });

    const version = await revokeAllSessions("user_1");

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "user_1" },
      data: { sessionVersion: { increment: 1 } },
      select: { sessionVersion: true }
    });
    expect(version).toBe(3);
  });

  it("returns the updated version (not the old one)", async () => {
    prisma.user.update.mockResolvedValue({ sessionVersion: 7 });
    expect(await revokeAllSessions("user_x")).toBe(7);
  });
});

describe("getCurrentSessionVersion", () => {
  it("returns the current sessionVersion for an active user", async () => {
    prisma.user.findUnique.mockResolvedValue({ sessionVersion: 5, deletedAt: null });
    expect(await getCurrentSessionVersion("user_1")).toBe(5);
  });

  it("returns null when the user does not exist", async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    expect(await getCurrentSessionVersion("ghost")).toBeNull();
  });

  it("returns null when the user is soft-deleted", async () => {
    prisma.user.findUnique.mockResolvedValue({
      sessionVersion: 2,
      deletedAt: new Date()
    });
    expect(await getCurrentSessionVersion("deleted_user")).toBeNull();
  });
});
