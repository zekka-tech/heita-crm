import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const tx = {
  $executeRaw: vi.fn(),
  membership: { findMany: vi.fn() }
};

const transactionOptions: unknown[] = [];

const prisma = {
  $transaction: vi.fn(async (fn: (txArg: typeof tx) => Promise<unknown>, options?: unknown) => {
    transactionOptions.push(options);
    await fn(tx);
    return "done";
  })
};

const globalForPrisma = globalThis as { prisma?: typeof prisma };
globalForPrisma.prisma = prisma;

const { withBusinessScope } = await import("@/lib/prisma");

beforeEach(() => {
  vi.clearAllMocks();
  transactionOptions.length = 0;
  tx.$executeRaw.mockResolvedValue(1);
  tx.membership.findMany.mockResolvedValue([{ id: "m_1" }]);
});

afterEach(() => {
  globalForPrisma.prisma = prisma;
});

describe("withBusinessScope", () => {
  it("sets app.current_business_id transaction-locally before running tenant work", async () => {
    const result = await withBusinessScope("biz_1", async (scopedTx) => {
      await scopedTx.membership.findMany({ where: {} });
      return "done";
    });

    expect(result).toBe("done");
    expect(transactionOptions).toEqual([{ maxWait: 5_000, timeout: 10_000 }]);
    expect(tx.$executeRaw).toHaveBeenCalledOnce();
    expect(tx.membership.findMany).toHaveBeenCalledWith({ where: {} });
    expect(tx.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
      tx.membership.findMany.mock.invocationCallOrder[0]!
    );
  });

  it("rejects empty business scopes", async () => {
    await expect(withBusinessScope(" ", async () => "never")).rejects.toThrow(/businessId is required/);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
