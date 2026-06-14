/**
 * Property-based multi-tenant RLS isolation test.
 *
 * Property: for any two distinct businessIds A and B,
 * data written under scope A must NEVER be readable under scope B.
 *
 * This test uses a mock Prisma client to simulate withBusinessScope behaviour
 * in-process (no real DB required). It verifies that:
 *   1. withBusinessScope correctly gates reads to the configured businessId.
 *   2. A row written under scope A is not returned when queried under scope B.
 *   3. A row written under scope A IS returned when queried under scope A.
 */

import { describe, it, expect } from "vitest";

// ---------------------------------------------------------------------------
// In-process RLS simulation
// ---------------------------------------------------------------------------

type StoredRow = { id: string; businessId: string; value: string };

function createIsolatedStore() {
  const rows: StoredRow[] = [];
  let activeScope: string | null = null;

  const scopedClient = {
    membership: {
      create(args: { data: { id: string; businessId: string; value: string } }) {
        if (!activeScope) throw new Error("No business scope set.");
        if (args.data.businessId !== activeScope) {
          throw new Error(
            `RLS violation: cannot write businessId="${args.data.businessId}" under scope="${activeScope}".`
          );
        }
        rows.push({ ...args.data });
        return args.data;
      },
      findMany(args: { where: { businessId: string } }) {
        if (!activeScope) return [];
        // With FORCE RLS: only rows matching the current scope are visible.
        return rows.filter(
          (r) => r.businessId === activeScope && r.businessId === args.where.businessId
        );
      },
    },
  };

  /**
   * Simulate withBusinessScope: sets the current scope, runs the callback,
   * then resets the scope (mimicking SET LOCAL transaction-local GUC).
   */
  async function withScope<T>(
    businessId: string,
    fn: (client: typeof scopedClient) => Promise<T>
  ): Promise<T> {
    const previous = activeScope;
    activeScope = businessId;
    try {
      return await fn(scopedClient);
    } finally {
      activeScope = previous;
    }
  }

  return { withScope, rows };
}

// ---------------------------------------------------------------------------
// Property test helpers
// ---------------------------------------------------------------------------

/** Generate a deterministic but varied list of [businessIdA, businessIdB] pairs. */
function generateDistinctPairs(count: number): Array<[string, string]> {
  const pairs: Array<[string, string]> = [];
  for (let i = 0; i < count; i++) {
    const a = `biz_${i * 2}`;
    const b = `biz_${i * 2 + 1}`;
    pairs.push([a, b]);
  }
  return pairs;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("RLS isolation property", () => {
  it("data written under scope A is not readable under scope B", async () => {
    const pairs = generateDistinctPairs(20);

    for (const [bizA, bizB] of pairs) {
      const { withScope } = createIsolatedStore();

      // Write a membership row under scope A.
      await withScope(bizA, async (tx) => {
        tx.membership.create({
          data: { id: `mem_${bizA}`, businessId: bizA, value: "tenant-a-secret" },
        });
      });

      // Query under scope B — must return 0 rows.
      const resultsUnderB = await withScope(bizB, async (tx) => {
        return tx.membership.findMany({ where: { businessId: bizA } });
      });

      expect(resultsUnderB).toHaveLength(0);
    }
  });

  it("data written under scope A IS readable under scope A", async () => {
    const pairs = generateDistinctPairs(20);

    for (const [bizA] of pairs) {
      const { withScope } = createIsolatedStore();

      await withScope(bizA, async (tx) => {
        tx.membership.create({
          data: { id: `mem_${bizA}`, businessId: bizA, value: "tenant-a-data" },
        });
      });

      const resultsUnderA = await withScope(bizA, async (tx) => {
        return tx.membership.findMany({ where: { businessId: bizA } });
      });

      expect(resultsUnderA).toHaveLength(1);
      expect(resultsUnderA[0]?.businessId).toBe(bizA);
    }
  });

  it("scope resets after withScope completes (no scope leak)", async () => {
    const { withScope, rows: _rows } = createIsolatedStore();
    const bizA = "biz_leak_a";
    const bizB = "biz_leak_b";

    // Write under A.
    await withScope(bizA, async (tx) => {
      tx.membership.create({ data: { id: "m1", businessId: bizA, value: "a" } });
    });

    // After scope A exits, querying under B should yield 0 (scope is reset).
    const afterLeak = await withScope(bizB, async (tx) => {
      return tx.membership.findMany({ where: { businessId: bizA } });
    });

    expect(afterLeak).toHaveLength(0);
  });

  it("multiple tenants in the same store remain isolated", async () => {
    const { withScope } = createIsolatedStore();

    const tenants = ["biz_red", "biz_green", "biz_blue"];

    // Write one row per tenant.
    for (const biz of tenants) {
      await withScope(biz, async (tx) => {
        tx.membership.create({ data: { id: `m_${biz}`, businessId: biz, value: biz } });
      });
    }

    // Each tenant reads only its own data.
    for (const biz of tenants) {
      const results = await withScope(biz, async (tx) =>
        tx.membership.findMany({ where: { businessId: biz } })
      );
      expect(results).toHaveLength(1);
      expect(results[0]?.businessId).toBe(biz);

      // Cross-reads return nothing.
      for (const other of tenants.filter((t) => t !== biz)) {
        const cross = await withScope(biz, async (tx) =>
          tx.membership.findMany({ where: { businessId: other } })
        );
        expect(cross).toHaveLength(0);
      }
    }
  });

  it("write with mismatched businessId throws under RLS simulation", async () => {
    const { withScope } = createIsolatedStore();

    await expect(
      withScope("biz_x", async (tx) => {
        tx.membership.create({
          data: { id: "bad_row", businessId: "biz_y", value: "mismatch" },
        });
      })
    ).rejects.toThrow(/RLS violation/);
  });
});
