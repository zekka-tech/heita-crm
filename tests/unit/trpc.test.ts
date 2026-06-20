import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn()
}));

// notificationsRouter uses withUserScope; we forward the call to fn so the
// test can control what the scoped transaction client returns.
vi.mock("@/lib/prisma", () => ({
  prisma: {},
  withUserScope: vi.fn(async (_userId: string, fn: (tx: unknown) => Promise<unknown>) =>
    fn({
      notification: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0)
      }
    })
  )
}));

const { appRouter } = await import("@/server/routers");
const { withUserScope } = await import("@/lib/prisma");

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

    vi.mocked(withUserScope).mockImplementationOnce((_userId, fn) =>
      (fn as (tx: unknown) => Promise<unknown>)({
        notification: { findMany, count: vi.fn().mockResolvedValue(1) }
      })
    );

    const caller = appRouter.createCaller({
      prisma: {} as never,
      session: {
        user: { id: "user_123" }
      } as never,
      requestId: "test-request"
    });

    const result = await caller.notifications.recent({ limit: 10 });

    expect(findMany).toHaveBeenCalledWith({
      where: { userId: "user_123" },
      orderBy: { createdAt: "desc" },
      take: 10
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.title).toBe("Tier upgraded");
  });
});
