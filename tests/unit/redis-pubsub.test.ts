import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  redis: {
    publish: vi.fn(),
    duplicate: vi.fn(),
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    disconnect: vi.fn(),
    on: vi.fn(),
    off: vi.fn()
  }
}));

vi.mock("@/lib/redis", () => ({
  getRedis: vi.fn(() => mocks.redis)
}));

const { publishEvent, subscribeToChannel } = await import("@/lib/redis-pubsub");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("redis-pubsub", () => {
  describe("publishEvent", () => {
    it("publishes a stringified JSON message to the channel", async () => {
      mocks.redis.publish.mockResolvedValue(1);

      await publishEvent("test:channel", { type: "test", value: 42 });

      expect(mocks.redis.publish).toHaveBeenCalledWith(
        "test:channel",
        JSON.stringify({ type: "test", value: 42 })
      );
    });

    it("swallows Redis errors and logs them", async () => {
      mocks.redis.publish.mockRejectedValue(new Error("Connection lost"));

      await expect(
        publishEvent("test:channel", { type: "test" })
      ).resolves.toBeUndefined();
    });
  });

  describe("subscribeToChannel", () => {
    it("creates a duplicate Redis connection and subscribes", async () => {
      const subMock = {
        subscribe: vi.fn().mockResolvedValue(undefined),
        on: vi.fn(),
        off: vi.fn(),
        unsubscribe: vi.fn().mockResolvedValue(undefined),
        disconnect: vi.fn()
      };
      mocks.redis.duplicate.mockReturnValue(subMock);

      const handler = vi.fn();
      const unsubscribe = await subscribeToChannel("user:123:events", handler);

      expect(mocks.redis.duplicate).toHaveBeenCalled();
      expect(subMock.subscribe).toHaveBeenCalledWith("user:123:events");
      expect(subMock.on).toHaveBeenCalledWith("message", expect.any(Function));

      unsubscribe();

      expect(subMock.off).toHaveBeenCalled();
      expect(subMock.unsubscribe).toHaveBeenCalledWith("user:123:events");
      expect(subMock.disconnect).toHaveBeenCalled();
    });

    it("calls handler with parsed JSON when message arrives", async () => {
      const subMock = {
        subscribe: vi.fn().mockResolvedValue(undefined),
        on: vi.fn(),
        off: vi.fn(),
        unsubscribe: vi.fn().mockResolvedValue(undefined),
        disconnect: vi.fn()
      };
      mocks.redis.duplicate.mockReturnValue(subMock);

      const handler = vi.fn();
      await subscribeToChannel("user:123:events", handler);

      const messageHandler = subMock.on.mock.calls.find(
        (call: Array<unknown>) => call[0] === "message"
      )?.[1] as ((...args: unknown[]) => unknown) | undefined;

      expect(messageHandler).toBeDefined();

      messageHandler!("user:123:events", JSON.stringify({ type: "test", value: 99 }));

      expect(handler).toHaveBeenCalledWith({ type: "test", value: 99 });
    });

    it("returns a no-op unsubscribe when Redis is unavailable", async () => {
      vi.doMock("@/lib/redis", () => ({
        getRedis: vi.fn(() => null)
      }));

      const handler = vi.fn();
      const result = await subscribeToChannel("test", handler);
      result();

      expect(handler).not.toHaveBeenCalled();
    });

    it("does not call handler after unsubscribe", async () => {
      const subMock = {
        subscribe: vi.fn().mockResolvedValue(undefined),
        on: vi.fn(),
        off: vi.fn(),
        unsubscribe: vi.fn().mockResolvedValue(undefined),
        disconnect: vi.fn()
      };
      mocks.redis.duplicate.mockReturnValue(subMock);

      const handler = vi.fn();
      const unsubscribe = await subscribeToChannel("user:123:events", handler);

      unsubscribe();
      for (const call of subMock.off.mock.calls) {
        if (call[0] === "message") {
          ((call[1] as (...args: unknown[]) => unknown))("user:123:events", JSON.stringify({ type: "test" }));
        }
      }

      expect(handler).not.toHaveBeenCalled();
    });

    it("handles JSON parse errors gracefully", async () => {
      const subMock = {
        subscribe: vi.fn().mockResolvedValue(undefined),
        on: vi.fn(),
        off: vi.fn(),
        unsubscribe: vi.fn().mockResolvedValue(undefined),
        disconnect: vi.fn()
      };
      mocks.redis.duplicate.mockReturnValue(subMock);

      const handler = vi.fn();
      await subscribeToChannel("test", handler);

      const messageHandler = subMock.on.mock.calls.find(
        (call: Array<unknown>) => call[0] === "message"
      )?.[1] as ((...args: unknown[]) => unknown) | undefined;

      expect(() => {
        messageHandler!("test", "invalid json");
      }).not.toThrow();
      expect(handler).not.toHaveBeenCalled();
    });
  });
});
