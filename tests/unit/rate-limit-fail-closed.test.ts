import { describe, expect, it, vi } from "vitest";

// Top-level mock so Vitest can hoist it before module imports
vi.mock("@/lib/redis", () => ({
  getRedis: () => ({
    eval: vi.fn().mockRejectedValue(new Error("Redis connection refused"))
  })
}));

const { enforceRateLimit } = await import("@/lib/rate-limit");

describe("enforceRateLimit failClosed", () => {
  it("falls back to memory (allows) when failClosed is false and Redis errors", async () => {
    const id = `fc-off:${Date.now()}`;
    const result = await enforceRateLimit({ identifier: id, windowSeconds: 60, max: 5, failClosed: false });
    expect(result.allowed).toBe(true);
  });

  it("denies when failClosed is true and Redis errors", async () => {
    const id = `fc-on:${Date.now()}`;
    const result = await enforceRateLimit({ identifier: id, windowSeconds: 60, max: 5, failClosed: true });
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });
});
