import { createHmac } from "crypto";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

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

vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { prisma } from "@/lib/prisma";
import { POST } from "@/app/api/email/webhook/route";
import { NextRequest } from "next/server";

// Base64-encoded test signing secret ("testsecret" in base64).
const TEST_SECRET_B64 = Buffer.from("testsecret").toString("base64");

function makeSvixSignature(body: string, msgId: string, timestamp: string): string {
  const secretBytes = Buffer.from(TEST_SECRET_B64, "base64");
  const signingInput = `${msgId}.${timestamp}.${body}`;
  const computed = createHmac("sha256", secretBytes).update(signingInput).digest("base64");
  return `v1,${computed}`;
}

function nowSeconds(): string {
  return String(Math.floor(Date.now() / 1000));
}

describe("POST /api/email/webhook — Svix signature verification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.EMAIL_WEBHOOK_SECRET = TEST_SECRET_B64;
  });
  afterEach(() => {
    process.env.EMAIL_WEBHOOK_SECRET = "";
  });

  it("accepts a request with a valid Svix signature", async () => {
    (prisma.user.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: "u1" });
    (prisma.userConsent.updateMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ count: 1 });

    const body = JSON.stringify({
      type: "email.complained",
      data: { email_id: "e1", to: ["user@test.com"], created_at: new Date().toISOString() },
    });
    const ts = nowSeconds();
    const msgId = "msg_test_001";

    const req = new NextRequest(new URL("http://localhost/api/email/webhook"), {
      method: "POST",
      body,
      headers: {
        "svix-id": msgId,
        "svix-timestamp": ts,
        "svix-signature": makeSvixSignature(body, msgId, ts),
      },
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
  });

  it("rejects a request with a tampered body (signature mismatch)", async () => {
    const body = JSON.stringify({
      type: "email.complained",
      data: { email_id: "e1", to: ["user@test.com"], created_at: new Date().toISOString() },
    });
    const ts = nowSeconds();
    const msgId = "msg_test_002";
    const tamperedBody = body + " ";

    const req = new NextRequest(new URL("http://localhost/api/email/webhook"), {
      method: "POST",
      body: tamperedBody,
      headers: {
        "svix-id": msgId,
        "svix-timestamp": ts,
        "svix-signature": makeSvixSignature(body, msgId, ts),
      },
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("rejects a request with missing svix-signature header", async () => {
    const body = JSON.stringify({ type: "email.delivered", data: { email_id: "e1", to: [], created_at: "" } });
    const req = new NextRequest(new URL("http://localhost/api/email/webhook"), {
      method: "POST",
      body,
      headers: { "svix-id": "msg_003", "svix-timestamp": nowSeconds() },
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("rejects a request with a stale timestamp (> 5 minutes old)", async () => {
    const body = JSON.stringify({ type: "email.delivered", data: { email_id: "e1", to: [], created_at: "" } });
    const staleTs = String(Math.floor(Date.now() / 1000) - 400);
    const msgId = "msg_004";

    const req = new NextRequest(new URL("http://localhost/api/email/webhook"), {
      method: "POST",
      body,
      headers: {
        "svix-id": msgId,
        "svix-timestamp": staleTs,
        "svix-signature": makeSvixSignature(body, msgId, staleTs),
      },
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("rejects a request with a completely wrong signature", async () => {
    const body = JSON.stringify({ type: "email.delivered", data: { email_id: "e1", to: [], created_at: "" } });
    const req = new NextRequest(new URL("http://localhost/api/email/webhook"), {
      method: "POST",
      body,
      headers: {
        "svix-id": "msg_005",
        "svix-timestamp": nowSeconds(),
        "svix-signature": "v1,bm90YXZhbGlkc2lnbmF0dXJl",
      },
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
  });
});

describe("POST /api/email/webhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.EMAIL_WEBHOOK_SECRET = "";
  });

  it("handles bounced event gracefully", async () => {
    (prisma.user.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: "u1" });
    const req = new NextRequest(new URL("http://localhost/api/email/webhook"), {
      method: "POST",
      body: JSON.stringify({
        type: "email.bounced",
        data: { email_id: "e1", to: ["bounce@test.com"], created_at: new Date().toISOString() },
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    // Bounced events should not revoke consent
    expect(prisma.userConsent.updateMany).not.toHaveBeenCalled();
  });

  it("revokes consent on complaint", async () => {
    (prisma.user.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: "u1" });
    (prisma.userConsent.updateMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ count: 1 });

    const req = new NextRequest(new URL("http://localhost/api/email/webhook"), {
      method: "POST",
      body: JSON.stringify({
        type: "email.complained",
        data: { email_id: "e1", to: ["complaint@test.com"], created_at: new Date().toISOString() },
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(prisma.userConsent.updateMany).toHaveBeenCalledWith({
      where: { userId: "u1", type: "EMAIL_MARKETING", revokedAt: null },
      data: { revokedAt: expect.any(Date) as Date },
    });
  });

  it("handles delivered event (no-op)", async () => {
    (prisma.user.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: "u1" });

    const req = new NextRequest(new URL("http://localhost/api/email/webhook"), {
      method: "POST",
      body: JSON.stringify({
        type: "email.delivered",
        data: { email_id: "e1", to: ["user@test.com"], created_at: new Date().toISOString() },
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(prisma.userConsent.updateMany).not.toHaveBeenCalled();
  });

  it("returns 400 for missing type field", async () => {
    const req = new NextRequest(new URL("http://localhost/api/email/webhook"), {
      method: "POST",
      body: JSON.stringify({ data: {} }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid JSON body", async () => {
    const req = new NextRequest(new URL("http://localhost/api/email/webhook"), {
      method: "POST",
      body: "not-json",
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 for null body", async () => {
    // A NextRequest with no body will have bodyUsed=true by default
    // Simulate by creating a request where text() returns null
    const req = new NextRequest(new URL("http://localhost/api/email/webhook"), {
      method: "POST",
    });

    // Override text() to return null to test the null body path
    Object.defineProperty(req, "text", {
      value: () => Promise.resolve(null),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("processes events for multiple recipients in to[] array", async () => {
    (prisma.user.findFirst as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ id: "u1" })
      .mockResolvedValueOnce({ id: "u2" });

    (prisma.userConsent.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1 });

    const req = new NextRequest(new URL("http://localhost/api/email/webhook"), {
      method: "POST",
      body: JSON.stringify({
        type: "email.complained",
        data: {
          email_id: "e1",
          to: ["user1@test.com", "user2@test.com"],
          created_at: new Date().toISOString(),
        },
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(prisma.userConsent.updateMany).toHaveBeenCalledTimes(2);
  });

  it("skips recipients not found in the database", async () => {
    (prisma.user.findFirst as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "u2" });

    (prisma.userConsent.updateMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ count: 1 });

    const req = new NextRequest(new URL("http://localhost/api/email/webhook"), {
      method: "POST",
      body: JSON.stringify({
        type: "email.complained",
        data: {
          email_id: "e1",
          to: ["unknown@test.com", "known@test.com"],
          created_at: new Date().toISOString(),
        },
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    // Only the second recipient triggered an update
    expect(prisma.userConsent.updateMany).toHaveBeenCalledTimes(1);
  });

  it("returns 500 on handler error", async () => {
    (prisma.user.findFirst as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("DB error"));

    const req = new NextRequest(new URL("http://localhost/api/email/webhook"), {
      method: "POST",
      body: JSON.stringify({
        type: "email.bounced",
        data: { email_id: "e1", to: ["user@test.com"], created_at: new Date().toISOString() },
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(500);
  });
});
