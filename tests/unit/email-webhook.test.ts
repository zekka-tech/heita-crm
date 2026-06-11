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
    businessInboundAddress: {
      findMany: vi.fn(),
    },
    business: {
      findMany: vi.fn(),
    },
    salesThread: {
      findFirst: vi.fn(),
    },
    message: {
      findFirst: vi.fn(),
      create: vi.fn(),
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

vi.mock("@/server/services/sales-thread.service", () => ({
  markCustomerResponded: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { markCustomerResponded } from "@/server/services/sales-thread.service";
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

describe("POST /api/email/webhook — inbound sales replies", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.EMAIL_WEBHOOK_SECRET = "";
    (prisma.businessInboundAddress.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (prisma.business.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (prisma.message.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (prisma.message.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "msg_in_1", createdAt: new Date("2026-01-01T00:00:00.000Z") });
  });

  it("links a signed inbound reply by sales thread headers and marks the customer responded", async () => {
    (prisma.user.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: "user_1", email: "customer@example.com" });
    (prisma.salesThread.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: "thread_1",
      businessId: "biz_1",
      contactPhone: "+27821234567"
    });

    const req = new NextRequest(new URL("http://localhost/api/email/webhook"), {
      method: "POST",
      body: JSON.stringify({
        type: "email.received",
        data: {
          email_id: "email_in_1",
          from: "Customer <customer@example.com>",
          to: ["sales@heita.test"],
          subject: "Re: Quote",
          text: "Looks good, please proceed.",
          headers: {
            "X-Heita-Sales-Thread-Id": "thread_1",
            "X-Heita-Business-Id": "biz_1"
          },
          created_at: new Date().toISOString()
        }
      })
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(prisma.message.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        businessId: "biz_1",
        userId: "user_1",
        salesThreadId: "thread_1",
        channel: "EMAIL",
        direction: "INBOUND",
        body: "Looks good, please proceed."
      })
    }));
    expect(markCustomerResponded).toHaveBeenCalledWith(expect.objectContaining({
      businessId: "biz_1",
      threadId: "thread_1",
      messageId: "msg_in_1"
    }));
  });

  it("falls back to tenant reply address mapping when headers are absent", async () => {
    (prisma.user.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: "user_1", email: "customer@example.com" });
    (prisma.businessInboundAddress.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([{ businessId: "biz_1" }]);
    (prisma.salesThread.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: "thread_1",
      businessId: "biz_1",
      contactPhone: "+27821234567"
    });

    const req = new NextRequest(new URL("http://localhost/api/email/webhook"), {
      method: "POST",
      body: JSON.stringify({
        type: "email.received",
        data: {
          email_id: "email_in_2",
          from: { email: "customer@example.com" },
          to: ["sales+biz1@inbound.heita.test"],
          subject: "Re: Quote",
          text: "Can you adjust the quantities?",
          created_at: new Date().toISOString()
        }
      })
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(prisma.businessInboundAddress.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        channel: "EMAIL",
        provider: "resend",
        address: { in: ["sales+biz1@inbound.heita.test"] }
      })
    }));
    expect(markCustomerResponded).toHaveBeenCalledOnce();
  });

  it("acknowledges unmatched inbound replies without creating a message", async () => {
    (prisma.user.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

    const req = new NextRequest(new URL("http://localhost/api/email/webhook"), {
      method: "POST",
      body: JSON.stringify({
        type: "email.received",
        data: {
          email_id: "email_in_3",
          from: "unknown@example.com",
          to: ["sales@heita.test"],
          text: "Hello"
        }
      })
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(prisma.message.create).not.toHaveBeenCalled();
    expect(markCustomerResponded).not.toHaveBeenCalled();
  });
});
