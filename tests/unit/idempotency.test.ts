import { describe, expect, it } from "vitest";

import { runIdempotentOperation } from "@/lib/idempotency";

describe("runIdempotentOperation (memory fallback)", () => {
  it("replays completed operations without re-executing them", async () => {
    let executions = 0;
    const scope = `test:${Date.now()}`;
    const key = "operation-1";

    const first = await runIdempotentOperation({
      scope,
      key,
      execute: async () => {
        executions += 1;
        return { version: "execute" };
      },
      replay: async () => ({ version: "replay" })
    });

    const second = await runIdempotentOperation({
      scope,
      key,
      execute: async () => {
        executions += 1;
        return { version: "execute-again" };
      },
      replay: async () => ({ version: "replay" })
    });

    expect(first).toEqual({ version: "execute" });
    expect(second).toEqual({ version: "replay" });
    expect(executions).toBe(1);
  });
});
