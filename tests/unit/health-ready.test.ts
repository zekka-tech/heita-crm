import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ------------------------------------------------------------------
// Mock infrastructure dependencies
// ------------------------------------------------------------------
const mockQueryRaw = vi.fn();
const mockPing = vi.fn();
const mockCheckStorageHealth = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: (...args: unknown[]) => mockQueryRaw(...args)
  }
}));
vi.mock("@/lib/redis", () => ({
  getRedis: () => ({ ping: mockPing })
}));
vi.mock("@/lib/storage", () => ({
  checkStorageHealth: () => mockCheckStorageHealth()
}));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));
vi.mock("@/lib/request-context", () => ({
  requestIdHeader: "x-request-id",
  resolveRequestId: () => "req_test"
}));
vi.mock("@/lib/ai/ollama", () => ({ ollamaConfigured: () => false }));
vi.mock("@/lib/ai/anthropic", () => ({ anthropicConfigured: () => false }));

const { handleHealthRequest } = await import("@/server/http/health-handler");

function makeRequest(deep = false) {
  const url = `http://localhost/api/health${deep ? "?deep=1" : ""}`;
  return new Request(url);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockQueryRaw.mockResolvedValue([{ "?column?": 1 }]);
  mockPing.mockResolvedValue("PONG");
  mockCheckStorageHealth.mockResolvedValue({ ok: true, latencyMs: 5, provider: "r2" });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("/api/health/ready (shallow)", () => {
  it("returns 200 with status ok when DB and Redis are healthy", async () => {
    const res = await handleHealthRequest(makeRequest(false));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.checks.database.ok).toBe(true);
    expect(body.checks.redis.ok).toBe(true);
  });

  it("returns 503 when DB is unreachable", async () => {
    mockQueryRaw.mockRejectedValue(new Error("Connection refused"));
    const res = await handleHealthRequest(makeRequest(false));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.status).toBe("degraded");
    expect(body.checks.database.ok).toBe(false);
    expect(body.checks.database.error).toMatch(/connection refused/i);
  });

  it("returns 503 when Redis ping fails", async () => {
    mockPing.mockRejectedValue(new Error("ECONNREFUSED"));
    const res = await handleHealthRequest(makeRequest(false));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.status).toBe("degraded");
    expect(body.checks.redis.ok).toBe(false);
  });

  it("includes Cache-Control: no-store to prevent stale health responses", async () => {
    const res = await handleHealthRequest(makeRequest(false));
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
});

describe("/api/health/ready?deep=1 (deep probe)", () => {
  it("returns 200 and includes deep check keys", async () => {
    const res = await handleHealthRequest(makeRequest(true));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.checks).toHaveProperty("ollama");
    expect(body.checks).toHaveProperty("anthropic");
    expect(body.checks).toHaveProperty("storage");
  });
});
