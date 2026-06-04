import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findFirst: vi.fn(),
    },
    userConsent: {
      updateMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/rate-limit", () => ({
  enforceRateLimit: vi.fn(),
  rateLimitHeaders: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { prisma } from "@/lib/prisma";
import { enforceRateLimit } from "@/lib/rate-limit";
import { GET, POST } from "@/app/api/email/unsubscribe/route";
import { NextRequest } from "next/server";

describe("GET /api/email/unsubscribe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (enforceRateLimit as ReturnType<typeof vi.fn>).mockResolvedValue({
      allowed: true,
      remaining: 10,
      resetInSeconds: 60,
    });
  });

  it("returns 400 when email param is missing", async () => {
    const req = new NextRequest(new URL("http://localhost/api/email/unsubscribe"));
    const res = await GET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ error: "Missing email parameter" });
  });

  it("returns 429 when rate limited", async () => {
    (enforceRateLimit as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      allowed: false,
      remaining: 0,
      resetInSeconds: 30,
    });

    const req = new NextRequest(new URL("http://localhost/api/email/unsubscribe?email=test@test.com"));
    const res = await GET(req);
    expect(res.status).toBe(429);
  });

  it("redirects when email is provided and user exists", async () => {
    (prisma.user.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: "u1" });
    (prisma.userConsent.updateMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ count: 1 });

    const req = new NextRequest(new URL("http://localhost/api/email/unsubscribe?email=test@test.com"));
    const res = await GET(req);

    // NextResponse.redirect returns a redirect response
    expect(res.status).toBe(307);
    expect(res.headers.get("Location")).toContain("/profile/consents?unsubscribed=1");
  });

  it("still redirects when email is provided but user not found", async () => {
    (prisma.user.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

    const req = new NextRequest(new URL("http://localhost/api/email/unsubscribe?email=nonexistent@test.com"));
    const res = await GET(req);

    expect(res.status).toBe(307);
    expect(prisma.userConsent.updateMany).not.toHaveBeenCalled();
  });
});

describe("POST /api/email/unsubscribe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (enforceRateLimit as ReturnType<typeof vi.fn>).mockResolvedValue({
      allowed: true,
      remaining: 10,
      resetInSeconds: 60,
    });
  });

  it("returns 400 when form data is missing List-Unsubscribe field", async () => {
    const req = new NextRequest(new URL("http://localhost/api/email/unsubscribe"), {
      method: "POST",
    });
    // NextRequest.formData() will throw if not properly set up; override it
    Object.defineProperty(req, "formData", {
      value: () => Promise.resolve(new FormData()),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ error: "Missing unsubscribe parameter" });
  });

  it("returns 200 when valid form data with email is provided and user exists", async () => {
    (prisma.user.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: "u1" });
    (prisma.userConsent.updateMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ count: 1 });

    const form = new FormData();
    form.set("List-Unsubscribe", "test@test.com");

    const req = new NextRequest(new URL("http://localhost/api/email/unsubscribe"), {
      method: "POST",
    });
    Object.defineProperty(req, "formData", {
      value: () => Promise.resolve(form),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ unsubscribed: true });
    expect(prisma.userConsent.updateMany).toHaveBeenCalledWith({
      where: { userId: "u1", type: "EMAIL_MARKETING", revokedAt: null },
      data: { revokedAt: expect.any(Date) as Date },
    });
  });

  it("still returns 200 when user is not found (graceful handling)", async () => {
    (prisma.user.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

    const form = new FormData();
    form.set("List-Unsubscribe", "unknown@test.com");

    const req = new NextRequest(new URL("http://localhost/api/email/unsubscribe"), {
      method: "POST",
    });
    Object.defineProperty(req, "formData", {
      value: () => Promise.resolve(form),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(prisma.userConsent.updateMany).not.toHaveBeenCalled();
  });
});
