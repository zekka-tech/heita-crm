import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock modules before dynamic import of the handler

vi.mock("@/lib/csrf", () => ({
  csrfFailureResponse: vi.fn().mockResolvedValue(null),
  CSRF_COOKIE: "__Host-heita-csrf",
  isValidCsrfToken: () => true,
  generateCsrfToken: () => "token",
  verifyCsrfTokenPair: () => ({ ok: true }),
  readCsrfCookieFromRequest: () => "token"
}));

vi.mock("@/lib/otp", () => ({
  issueOtpCode: vi.fn().mockResolvedValue({ code: "123456", expiresAt: new Date() })
}));

vi.mock("@/lib/sms", () => ({
  sendOtpSms: vi.fn().mockResolvedValue({ ok: true })
}));

vi.mock("@/lib/turnstile", () => ({
  verifyTurnstileToken: vi.fn().mockResolvedValue({ ok: true })
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn().mockResolvedValue(null),
      findFirst: vi.fn().mockResolvedValue(null)
    }
  }
}));

vi.mock("@/lib/metrics", () => ({
  observeHttpRoute: vi.fn(),
  incrementOtpMetric: vi.fn()
}));

const mockEnforceRateLimit = vi.fn().mockResolvedValue({
  allowed: true,
  remaining: 10,
  resetInSeconds: 3600
});

vi.mock("@/lib/rate-limit", () => ({
  enforceRateLimit: (...args: unknown[]) => mockEnforceRateLimit(...args),
  rateLimitHeaders: () => ({})
}));

const { handleRequestOtp } = await import("@/server/http/request-otp-handler");

function makeOtpRequest(phone = "+27821234567") {
  return new Request("http://localhost/api/auth/request-otp", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-heita-csrf": "test-csrf-token-valid-32chars-xx",
      cookie: "__Host-heita-csrf=test-csrf-token-valid-32chars-xx",
      "x-forwarded-for": "1.2.3.4"
    },
    body: JSON.stringify({ phone, mode: "sign-in" })
  });
}

beforeEach(() => {
  mockEnforceRateLimit.mockResolvedValue({ allowed: true, remaining: 10, resetInSeconds: 3600 });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("handleRequestOtp — rate-limit ordering", () => {
  it("enforces IP limit before phone lookup (first limit checked)", async () => {
    let callCount = 0;
    mockEnforceRateLimit.mockImplementation(async (opts: { identifier: string }) => {
      callCount++;
      if (callCount === 1) {
        // IP limit is first — deny it
        expect(opts.identifier).toMatch(/^otp:ip:/);
        return { allowed: false, remaining: 0, resetInSeconds: 3600 };
      }
      return { allowed: true, remaining: 10, resetInSeconds: 3600 };
    });

    const res = await handleRequestOtp(makeOtpRequest());
    expect(res.status).toBe(429);
    // Only one rate-limit call when IP limit blocks (no further calls)
    expect(callCount).toBe(1);
  });

  it("enforces burst limit before phone hourly limit (second check)", async () => {
    let callCount = 0;
    mockEnforceRateLimit.mockImplementation(async (opts: { identifier: string }) => {
      callCount++;
      if (callCount === 1) return { allowed: true, remaining: 10, resetInSeconds: 3600 };
      if (callCount === 2) {
        expect(opts.identifier).toMatch(/^otp:phone-burst:/);
        return { allowed: false, remaining: 0, resetInSeconds: 60 };
      }
      return { allowed: true, remaining: 10, resetInSeconds: 3600 };
    });

    const res = await handleRequestOtp(makeOtpRequest());
    expect(res.status).toBe(429);
    expect(callCount).toBe(2);
  });
});

describe("handleRequestOtp — OTP enumeration parity", () => {
  it("returns 200 with generic message for unknown phone", async () => {
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

    const res = await handleRequestOtp(makeOtpRequest("+27800000000"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.message).toContain("If your number is registered");
  });

  it("returns 200 with the same generic message for a known phone", async () => {
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "usr_1",
      phone: "+27821234567"
    } as never);

    const res = await handleRequestOtp(makeOtpRequest("+27821234567"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.message).toContain("If your number is registered");
  });
});

describe("handleRequestOtp — invalid input", () => {
  it("rejects an obviously invalid phone number", async () => {
    const res = await handleRequestOtp(makeOtpRequest("not-a-phone"));
    expect(res.status).toBe(400);
  });
});
