import { describe, expect, it } from "vitest";

import { enforceRateLimit } from "@/lib/rate-limit";

describe("enforceRateLimit (memory fallback)", () => {
  it("allows requests below the limit", async () => {
    const id = `test:${Date.now()}:allow`;
    const first = await enforceRateLimit({ identifier: id, windowSeconds: 60, max: 3 });
    expect(first.allowed).toBe(true);
    expect(first.remaining).toBe(2);
  });

  it("blocks requests above the limit", async () => {
    const id = `test:${Date.now()}:block`;
    const a = await enforceRateLimit({ identifier: id, windowSeconds: 60, max: 2 });
    const b = await enforceRateLimit({ identifier: id, windowSeconds: 60, max: 2 });
    const c = await enforceRateLimit({ identifier: id, windowSeconds: 60, max: 2 });

    expect(a.allowed).toBe(true);
    expect(b.allowed).toBe(true);
    expect(c.allowed).toBe(false);
    expect(c.remaining).toBe(0);
  });

  it("isolates different identifiers", async () => {
    const result = await enforceRateLimit({
      identifier: `iso-${Math.random()}`,
      windowSeconds: 60,
      max: 1
    });
    expect(result.allowed).toBe(true);
  });
});
