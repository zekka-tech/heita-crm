import { afterEach, describe, expect, it } from "vitest";

import { getQueueRedis } from "@/lib/redis";

const originalRedisUrl = process.env.REDIS_URL;

afterEach(() => {
  if (originalRedisUrl === undefined) {
    delete process.env.REDIS_URL;
  } else {
    process.env.REDIS_URL = originalRedisUrl;
  }

  if (typeof globalThis !== "undefined") {
    delete (globalThis as { __heitaRedisQueue__?: unknown }).__heitaRedisQueue__;
  }
});

describe("getQueueRedis", () => {
  it("returns null when REDIS_URL is unset", () => {
    delete process.env.REDIS_URL;
    expect(getQueueRedis()).toBeNull();
  });

  it("creates a connection with BullMQ-compatible options when REDIS_URL is set", () => {
    process.env.REDIS_URL = "redis://localhost:6379";

    const connection = getQueueRedis();
    expect(connection).not.toBeNull();
    expect(connection?.options.maxRetriesPerRequest).toBeNull();
    expect(connection?.options.enableReadyCheck).toBe(false);

    connection?.disconnect();
  });
});
