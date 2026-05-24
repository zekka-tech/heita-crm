import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/auth", () => ({
  auth: vi.fn()
}));

const { appRouter } = await import("@/server/routers");

describe("tRPC router", () => {
  it("rejects protected notification queries without a session", async () => {
    const caller = appRouter.createCaller({
      prisma: {} as never,
      session: null,
      requestId: "test-request"
    });

    await expect(caller.notifications.recent({ limit: 5 })).rejects.toMatchObject({
      code: "UNAUTHORIZED"
    });
  });

  it("returns recent notifications for authenticated users", async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        id: "notif_1",
        title: "Tier upgraded",
        body: "You reached Silver.",
        isRead: false,
        createdAt: new Date("2026-05-24T09:00:00.000Z")
      }
    ]);

    const caller = appRouter.createCaller({
      prisma: {
        notification: {
          findMany
        }
      } as never,
      session: {
        user: {
          id: "user_123"
        }
      } as never,
      requestId: "test-request"
    });

    const result = await caller.notifications.recent({ limit: 10 });

    expect(findMany).toHaveBeenCalledWith({
      where: {
        userId: "user_123"
      },
      orderBy: {
        createdAt: "desc"
      },
      take: 10
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.title).toBe("Tier upgraded");
  });
});
