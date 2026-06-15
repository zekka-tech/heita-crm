import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => {
  const prisma = {
    otpCode: { deleteMany: vi.fn().mockResolvedValue({ count: 3 }) },
    userConsent: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
    user: { findMany: vi.fn().mockResolvedValue([]), updateMany: vi.fn().mockResolvedValue({ count: 0 }) }
  };

  return {
    prisma,
    withSystemScope: vi.fn(async (fn: (tx: typeof prisma) => unknown) => fn(prisma)),
  };
});

vi.mock("@/lib/redis", () => ({
  getRedis: () => ({
    get: vi.fn().mockResolvedValue(null),
    setex: vi.fn().mockResolvedValue("OK")
  })
}));

vi.mock("@/server/services/events.service", () => ({
  sendDueEventReminders: vi.fn().mockResolvedValue({ sent: 0 })
}));

vi.mock("@/server/services/loyalty.service", () => ({
  expireEligiblePoints: vi.fn().mockResolvedValue({ expired: 0 })
}));

const { handleCleanupOtpCron, handleExpirePointsCron, handleSendRemindersCron } =
  await import("@/server/http/cron-handlers");

const SECRET = "a".repeat(32);
process.env.CRON_SECRET = SECRET;

function makeRequest(headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/cron/cleanup-otp", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers }
  });
}

describe("cron authorization", () => {
  it("returns 401 when CRON_SECRET is missing", async () => {
    const res = await handleCleanupOtpCron(makeRequest());
    expect(res.status).toBe(401);
  });

  it("returns 401 when secret is wrong", async () => {
    const res = await handleCleanupOtpCron(makeRequest({ "x-cron-secret": "wrong" }));
    expect(res.status).toBe(401);
  });

  it("uses constant-time compare — wrong-length secret still 401", async () => {
    const res = await handleCleanupOtpCron(
      makeRequest({ "x-cron-secret": SECRET.slice(0, 10) })
    );
    expect(res.status).toBe(401);
  });

  it("accepts correct secret via x-cron-secret header", async () => {
    const res = await handleCleanupOtpCron(makeRequest({ "x-cron-secret": SECRET }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it("accepts correct secret via Authorization: Bearer header", async () => {
    const res = await handleCleanupOtpCron(
      makeRequest({ authorization: `Bearer ${SECRET}` })
    );
    expect(res.status).toBe(200);
  });
});

describe("handleExpirePointsCron", () => {
  it("returns ok when authorized", async () => {
    const res = await handleExpirePointsCron(
      new Request("http://localhost/api/cron/expire-points", {
        method: "POST",
        headers: { "x-cron-secret": SECRET }
      })
    );
    expect(res.status).toBe(200);
  });
});

describe("handleSendRemindersCron", () => {
  it("returns ok when authorized", async () => {
    const res = await handleSendRemindersCron(
      new Request("http://localhost/api/cron/send-reminders", {
        method: "POST",
        headers: { "x-cron-secret": SECRET }
      })
    );
    expect(res.status).toBe(200);
  });
});
