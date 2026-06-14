import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  subscribeToChannel: vi.fn(),
  redis: {
    duplicate: vi.fn(),
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    disconnect: vi.fn(),
    on: vi.fn(),
    off: vi.fn()
  }
}));

vi.mock("@/lib/auth", () => ({
  auth: mocks.auth
}));

vi.mock("@/lib/redis-pubsub", () => ({
  subscribeToChannel: mocks.subscribeToChannel
}));

const { GET } = await import("@/app/api/connect/stream/route");

function createRequest(signal?: AbortSignal): Request {
  return new Request("http://localhost/api/connect/stream", { signal });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: "user_1" } });
  mocks.subscribeToChannel.mockResolvedValue(() => {});
});

describe("connect-stream SSE endpoint", () => {
  it("returns 401 when user is not authenticated", async () => {
    mocks.auth.mockResolvedValue({ user: null });

    const response = await GET(createRequest() as unknown as never);

    expect(response.status).toBe(401);
  });

  it("returns SSE response with correct headers", async () => {
    const response = await GET(createRequest() as unknown as never);

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/event-stream");
    expect(response.headers.get("Cache-Control")).toBe("no-cache, no-transform");
    expect(response.headers.get("Connection")).toBe("keep-alive");
  });

  it("subscribes to the user events channel on connect", async () => {
    await GET(createRequest() as unknown as never);

    expect(mocks.subscribeToChannel).toHaveBeenCalledWith(
      "user:user_1:events",
      expect.any(Function)
    );
  });

  it("sends a connected frame on open", async () => {
    const response = await GET(createRequest() as unknown as never);
    const reader = response.body?.getReader();
    expect(reader).toBeDefined();

    const { value } = await reader!.read();
    const text = new TextDecoder().decode(value);

    expect(text).toContain("event: connected");
    expect(text).toContain("user_1");

    reader!.cancel();
  });

  it("handles client disconnect via abort signal", async () => {
    const controller = new AbortController();
    const response = await GET(createRequest(controller.signal) as unknown as never);
    const reader = response.body?.getReader();

    controller.abort();

    try {
      await reader!.read();
    } catch {
      // Expected: stream closed
    }
  });
});
