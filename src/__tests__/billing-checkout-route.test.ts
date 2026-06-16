import { beforeEach, describe, expect, it, vi } from "vitest";

import { TELEMETRY_EVENTS } from "@/lib/telemetry-events";

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));
vi.mock("@/lib/csrf", () => ({ verifyCsrfNextApiRequest: vi.fn(() => true) }));
vi.mock("@/lib/request-auth", () => ({
  authenticateRequestUser: vi.fn(async () => ({ userId: "owner-1" }))
}));
vi.mock("@/lib/staff", () => ({ requireRole: vi.fn(async () => undefined) }));
vi.mock("@/server/services/payments/registry", () => ({
  isConfiguredProvider: vi.fn(() => true)
}));
vi.mock("@/server/services/billing.service", () => ({
  createCheckout: vi.fn(async () => ({ url: "https://pay.example/session" }))
}));
vi.mock("@/lib/telemetry", () => ({ captureEvent: vi.fn() }));

const { captureEvent } = await import("@/lib/telemetry");
const { createCheckout } = await import("@/server/services/billing.service");
const handler = (await import("@/pages/api/billing/checkout")).default;

interface MockRes {
  statusCode: number;
  body: unknown;
  status: (code: number) => MockRes;
  json: (payload: unknown) => MockRes;
  setHeader: (k: string, v: string) => void;
}

function makeRes(): MockRes {
  const res: MockRes = {
    statusCode: 0,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    setHeader() {}
  };
  return res;
}

function makeReq(body: Record<string, unknown>) {
  return { method: "POST", headers: {}, body } as never;
}

describe("billing checkout route — checkout_started telemetry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("emits checkout_started after a successful checkout session", async () => {
    const res = makeRes();
    await handler(makeReq({ businessId: "biz-1", planId: "GROWTH", provider: "YOCO" }), res as never);

    expect(res.statusCode).toBe(200);
    expect(captureEvent).toHaveBeenCalledTimes(1);
    expect(captureEvent).toHaveBeenCalledWith({
      userId: "owner-1",
      event: TELEMETRY_EVENTS.checkoutStarted,
      properties: { businessId: "biz-1", plan: "GROWTH", provider: "YOCO" }
    });
  });

  it("does not emit checkout_started when checkout creation fails", async () => {
    vi.mocked(createCheckout).mockRejectedValueOnce(new Error("gateway down"));
    const res = makeRes();
    await handler(makeReq({ businessId: "biz-1", planId: "GROWTH", provider: "YOCO" }), res as never);

    expect(res.statusCode).toBe(502);
    expect(captureEvent).not.toHaveBeenCalled();
  });

  it("does not emit checkout_started for an invalid plan", async () => {
    const res = makeRes();
    await handler(makeReq({ businessId: "biz-1", planId: "FREE", provider: "YOCO" }), res as never);

    expect(res.statusCode).toBe(400);
    expect(captureEvent).not.toHaveBeenCalled();
  });
});
