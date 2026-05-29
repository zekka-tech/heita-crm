import crypto from "node:crypto";
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));
vi.mock("@/server/services/billing.service", () => ({
  handleYocoWebhook: vi.fn().mockResolvedValue(undefined)
}));

const SECRET = "test-yoco-webhook-secret-32char";

function makeSignature(body: string, secret = SECRET): string {
  return crypto.createHmac("sha256", secret).update(body).digest("hex");
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function makeRequest(body: string, overrides: { signature?: string; timestamp?: string | null } = {}) {
  const signature = overrides.signature ?? makeSignature(body);
  const headers: Record<string, string> = {
    "x-yoco-signature": signature,
    "Content-Type": "application/json"
  };
  if (overrides.timestamp !== null) {
    headers["x-yoco-timestamp"] = overrides.timestamp ?? String(nowSeconds());
  }
  return new Request("http://localhost/api/webhooks/yoco", {
    method: "POST",
    headers,
    body
  });
}

describe("Yoco webhook route", () => {
  const originalEnv = process.env.YOCO_WEBHOOK_SECRET;

  beforeEach(() => {
    process.env.YOCO_WEBHOOK_SECRET = SECRET;
  });

  it("accepts a valid request without timestamp header", async () => {
    const body = JSON.stringify({ type: "payment.succeeded", payload: {} });
    const { POST } = await import("@/app/api/webhooks/yoco/route");
    const req = makeRequest(body, { timestamp: null });
    const res = await POST(req as never);
    expect(res.status).toBe(200);
  });

  it("accepts a valid request with timestamp within 5 minutes", async () => {
    const body = JSON.stringify({ type: "payment.succeeded", payload: {} });
    const { POST } = await import("@/app/api/webhooks/yoco/route");
    const req = makeRequest(body, { timestamp: String(nowSeconds() - 60) });
    const res = await POST(req as never);
    expect(res.status).toBe(200);
  });

  it("rejects a replayed request with timestamp older than 5 minutes", async () => {
    const body = JSON.stringify({ type: "payment.succeeded", payload: {} });
    const { POST } = await import("@/app/api/webhooks/yoco/route");
    const req = makeRequest(body, { timestamp: String(nowSeconds() - 400) });
    const res = await POST(req as never);
    expect(res.status).toBe(401);
    const data = await res.json() as { error: string };
    expect(data.error).toMatch(/timestamp/i);
  });

  it("rejects a request with an invalid signature", async () => {
    const body = JSON.stringify({ type: "payment.succeeded", payload: {} });
    const { POST } = await import("@/app/api/webhooks/yoco/route");
    const req = makeRequest(body, { signature: "badsignature" });
    const res = await POST(req as never);
    expect(res.status).toBe(401);
  });

  it("rejects a request with a missing signature", async () => {
    const body = JSON.stringify({ type: "payment.succeeded", payload: {} });
    const { POST } = await import("@/app/api/webhooks/yoco/route");
    const headers = { "Content-Type": "application/json" };
    const req = new Request("http://localhost/api/webhooks/yoco", { method: "POST", headers, body });
    const res = await POST(req as never);
    expect(res.status).toBe(401);
  });

  it("returns 500 when YOCO_WEBHOOK_SECRET is not configured", async () => {
    process.env.YOCO_WEBHOOK_SECRET = "";
    const body = JSON.stringify({ type: "payment.succeeded", payload: {} });
    const { POST } = await import("@/app/api/webhooks/yoco/route");
    const req = makeRequest(body);
    const res = await POST(req as never);
    expect(res.status).toBe(500);
    process.env.YOCO_WEBHOOK_SECRET = originalEnv ?? SECRET;
  });
});
