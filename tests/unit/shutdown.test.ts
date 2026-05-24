import { beforeEach, describe, expect, it, vi } from "vitest";

import { __shutdownInternals, registerShutdownHandler } from "@/lib/shutdown";

beforeEach(() => {
  __shutdownInternals.reset();
});

describe("registerShutdownHandler", () => {
  it("adds handlers and returns an unsubscribe", () => {
    const handler = vi.fn();
    const unsubscribe = registerShutdownHandler(handler);
    expect(typeof unsubscribe).toBe("function");
    unsubscribe();
    expect(handler).not.toHaveBeenCalled();
  });

  it("supports multiple handlers", () => {
    const a = vi.fn();
    const b = vi.fn();
    registerShutdownHandler(a);
    registerShutdownHandler(b);
    expect(a).not.toHaveBeenCalled();
    expect(b).not.toHaveBeenCalled();
  });
});
