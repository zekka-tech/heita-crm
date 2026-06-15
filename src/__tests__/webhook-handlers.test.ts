import crypto from "node:crypto";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const prismaMock = vi.hoisted(() => ({
  businessInboundAddress: { findFirst: vi.fn() },
  business: { findFirst: vi.fn() },
  user: { findFirst: vi.fn() },
  message: { findFirst: vi.fn(), create: vi.fn() }
}));
const salesThreadMock = vi.hoisted(() => ({
  markCustomerResponded: vi.fn()
}));

// ------------------------------------------------------------------
// Mock heavy dependencies so the handler module loads cleanly
// ------------------------------------------------------------------
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));
vi.mock("@/lib/metrics", () => ({
  observeHttpRoute: vi.fn(),
  incrementWebhookAuthFailure: vi.fn()
}));
vi.mock("@/lib/request-context", () => ({
  requestIdHeader: "x-request-id",
  resolveRequestId: vi.fn(() => "req_test")
}));
vi.mock("@/lib/circuit-breaker", () => ({
  CircuitBreakerOpenError: class extends Error {},
  runWithCircuitBreaker: vi.fn().mockResolvedValue(undefined)
}));
vi.mock("@/server/services/whatsapp.service", () => ({
  handleWhatsappInboundPayload: vi.fn().mockResolvedValue(undefined)
}));
vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
  withBusinessScope: vi.fn(async (_businessId: string, fn: (tx: typeof prismaMock) => unknown) => fn(prismaMock))
}));
vi.mock("@/server/services/sales-thread.service", () => salesThreadMock);

const {
  handleWhatsappVerification,
  handleWhatsappWebhook,
  handleAfricasTalkingWebhook
} = await import("@/server/http/webhook-handlers");

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

function makeRequest(
  url: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  } = {}
): Request {
  return new Request(url, {
    method: options.method ?? "GET",
    headers: new Headers(options.headers ?? {}),
    body: options.body
  });
}

function signWhatsapp(body: string, secret: string): string {
  return `sha256=${crypto.createHmac("sha256", secret).update(body).digest("hex")}`;
}

function signAt(body: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(body).digest("hex");
}

// ------------------------------------------------------------------
describe("handleWhatsappVerification", () => {
  const VERIFY_TOKEN = "test-verify-token";

  beforeEach(() => {
    process.env.WHATSAPP_VERIFY_TOKEN = VERIFY_TOKEN;
  });

  afterEach(() => {
    delete process.env.WHATSAPP_VERIFY_TOKEN;
  });

  it("returns 200 with the challenge when the token matches", async () => {
    const req = makeRequest(
      `https://example.com/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=${VERIFY_TOKEN}&hub.challenge=abc123`
    );

    const res = await handleWhatsappVerification(req);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toBe("abc123");
  });

  it("returns 403 when the token does not match", async () => {
    const req = makeRequest(
      "https://example.com/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=abc123"
    );

    const res = await handleWhatsappVerification(req);
    expect(res.status).toBe(403);
  });

  it("returns 403 when hub.mode is not 'subscribe'", async () => {
    const req = makeRequest(
      `https://example.com/api/webhooks/whatsapp?hub.mode=unsubscribe&hub.verify_token=${VERIFY_TOKEN}&hub.challenge=abc123`
    );

    const res = await handleWhatsappVerification(req);
    expect(res.status).toBe(403);
  });
});

// ------------------------------------------------------------------
describe("handleWhatsappWebhook — HMAC verification", () => {
  const APP_SECRET = "test-app-secret";

  beforeEach(() => {
    process.env.WHATSAPP_APP_SECRET = APP_SECRET;
  });

  afterEach(() => {
    delete process.env.WHATSAPP_APP_SECRET;
  });

  it("returns 200 for a valid HMAC and a fresh timestamp", async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const body = JSON.stringify({
      entry: [
        {
          changes: [
            {
              value: {
                messages: [{ timestamp: nowSec }]
              }
            }
          ]
        }
      ]
    });
    const sig = signWhatsapp(body, APP_SECRET);

    const req = makeRequest("https://example.com/api/webhooks/whatsapp", {
      method: "POST",
      headers: { "x-hub-signature-256": sig, "content-type": "application/json" },
      body
    });

    const res = await handleWhatsappWebhook(req);
    expect(res.status).toBe(200);
  });

  it("returns 401 for an invalid HMAC", async () => {
    const body = JSON.stringify({ entry: [] });

    const req = makeRequest("https://example.com/api/webhooks/whatsapp", {
      method: "POST",
      headers: { "x-hub-signature-256": "sha256=badhash", "content-type": "application/json" },
      body
    });

    const res = await handleWhatsappWebhook(req);
    expect(res.status).toBe(401);
  });

  it("returns 401 when the message timestamp is outside the 5-minute window (replay attack)", async () => {
    const staleTimestamp = Math.floor(Date.now() / 1000) - 400;
    const body = JSON.stringify({
      entry: [
        {
          changes: [
            {
              value: {
                messages: [{ timestamp: staleTimestamp }]
              }
            }
          ]
        }
      ]
    });
    const sig = signWhatsapp(body, APP_SECRET);

    const req = makeRequest("https://example.com/api/webhooks/whatsapp", {
      method: "POST",
      headers: { "x-hub-signature-256": sig },
      body
    });

    const res = await handleWhatsappWebhook(req);
    expect(res.status).toBe(401);
  });

  it("returns 500 when WHATSAPP_APP_SECRET is not set", async () => {
    delete process.env.WHATSAPP_APP_SECRET;

    const body = JSON.stringify({});
    const req = makeRequest("https://example.com/api/webhooks/whatsapp", {
      method: "POST",
      headers: { "x-hub-signature-256": "sha256=anything" },
      body
    });

    const res = await handleWhatsappWebhook(req);
    expect(res.status).toBe(500);
  });
});

// ------------------------------------------------------------------
describe("handleAfricasTalkingWebhook", () => {
  const AT_SECRET = "at-test-secret";

  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.businessInboundAddress.findFirst.mockResolvedValue(null);
    prismaMock.business.findFirst.mockResolvedValue(null);
    prismaMock.user.findFirst.mockResolvedValue(null);
    prismaMock.message.findFirst.mockResolvedValue(null);
    prismaMock.message.create.mockResolvedValue({ id: "msg_1", createdAt: new Date("2026-01-01T00:00:00.000Z") });
    process.env.AT_WEBHOOK_SECRET = AT_SECRET;
    // @ts-expect-error: overriding read-only env for test purposes
    process.env.NODE_ENV = "production";
  });

  afterEach(() => {
    delete process.env.AT_WEBHOOK_SECRET;
    // @ts-expect-error: restoring read-only env after test
    process.env.NODE_ENV = "test";
  });

  it("returns 200 for a valid shared-secret + HMAC from a known AT IP", async () => {
    const body = "messageId=123&from=%2B27821234567&to=20880&text=Hello&timestamp=";
    const withTimestamp = `${body}${Date.now()}`;
    const hmac = signAt(withTimestamp, AT_SECRET);

    const req = makeRequest("https://example.com/api/webhooks/africas-talking", {
      method: "POST",
      headers: {
        // AT connects directly; use x-real-ip (not XFF) since getClientIp
        // no longer honours X-Forwarded-For when TRUSTED_PROXY_IPS is unset.
        "x-real-ip": "196.201.214.50",
        "x-at-shared-secret": AT_SECRET,
        "x-at-signature": hmac
      },
      body: withTimestamp
    });

    const res = await handleAfricasTalkingWebhook(req);
    expect(res.status).toBe(200);
  });

  it("routes inbound SMS shortcodes through tenant mappings", async () => {
    prismaMock.businessInboundAddress.findFirst.mockResolvedValueOnce({ businessId: "biz_1" });
    prismaMock.user.findFirst.mockResolvedValueOnce({ id: "user_1" });

    const body = "messageId=sms_1&from=%2B27821234567&to=20880&text=Reply&timestamp=" + Date.now();
    const req = makeRequest("https://example.com/api/webhooks/africas-talking", {
      method: "POST",
      headers: {
        "x-real-ip": "196.201.214.50",
        "x-at-shared-secret": AT_SECRET,
        "x-at-signature": signAt(body, AT_SECRET)
      },
      body
    });

    const res = await handleAfricasTalkingWebhook(req);
    expect(res.status).toBe(200);
    expect(prismaMock.businessInboundAddress.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        channel: "SMS",
        provider: "africas-talking",
        address: { in: ["20880"] }
      })
    }));
    expect(prismaMock.message.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        businessId: "biz_1",
        userId: "user_1",
        contactPhone: "+27821234567",
        channel: "SMS",
        direction: "INBOUND",
        body: "Reply"
      })
    }));
    expect(salesThreadMock.markCustomerResponded).toHaveBeenCalledWith(expect.objectContaining({
      businessId: "biz_1",
      contactPhone: "+27821234567",
      messageId: "msg_1"
    }));
  });

  it("returns 401 when the shared secret is wrong", async () => {
    const body = "messageId=1&from=%2B27&to=20880&text=Hi";
    const req = makeRequest("https://example.com/api/webhooks/africas-talking", {
      method: "POST",
      headers: {
        "x-forwarded-for": "196.201.214.50",
        "x-at-shared-secret": "wrong-secret",
        "x-at-signature": signAt(body, AT_SECRET)
      },
      body
    });

    const res = await handleAfricasTalkingWebhook(req);
    expect(res.status).toBe(401);
  });

  it("returns 401 when the HMAC is wrong even if the IP and shared-secret are correct", async () => {
    const body = "messageId=1&from=%2B27&to=20880&text=Hi";
    const req = makeRequest("https://example.com/api/webhooks/africas-talking", {
      method: "POST",
      headers: {
        "x-forwarded-for": "196.201.214.50",
        "x-at-shared-secret": AT_SECRET,
        "x-at-signature": "badhashvalue"
      },
      body
    });

    const res = await handleAfricasTalkingWebhook(req);
    expect(res.status).toBe(401);
  });

  it("returns 401 for a replayed request (timestamp outside 5-minute window)", async () => {
    const staleMs = Date.now() - 6 * 60 * 1000;
    const body = `messageId=1&from=%2B27&to=20880&text=Hi&timestamp=${staleMs}`;
    const hmac = signAt(body, AT_SECRET);

    const req = makeRequest("https://example.com/api/webhooks/africas-talking", {
      method: "POST",
      headers: {
        "x-forwarded-for": "196.201.214.50",
        "x-at-shared-secret": AT_SECRET,
        "x-at-signature": hmac
      },
      body
    });

    const res = await handleAfricasTalkingWebhook(req);
    expect(res.status).toBe(401);
  });
});
