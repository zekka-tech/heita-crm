import { beforeEach, describe, expect, it, vi } from "vitest";

const prisma = {
  user: {
    findFirst: vi.fn()
  },
  notification: {
    create: vi.fn()
  }
};

const sendPushToUser = vi.fn();
const sendEmail = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma
}));

vi.mock("@/lib/push", () => ({
  sendPushToUser
}));

vi.mock("@/lib/email", () => ({
  sendEmail
}));

const { sendNotification } = await import("@/server/services/notification.service");

describe("sendNotification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("respects disabled in-app delivery while still sending allowed channels", async () => {
    prisma.user.findFirst.mockResolvedValue({
      email: "member@example.com",
      notificationPreferences: {
        version: 1,
        businesses: {
          biz_1: {
            channels: {
              inApp: false,
              push: true,
              email: false
            },
            quietHours: {
              enabled: false,
              start: "22:00",
              end: "07:00",
              timezone: "Africa/Johannesburg"
            }
          }
        }
      }
    });
    sendPushToUser.mockResolvedValue({ delivered: 1, skipped: false });

    const result = await sendNotification({
      userId: "user_1",
      businessId: "biz_1",
      title: "Tier upgraded",
      body: "You reached Silver.",
      type: "LOYALTY"
    });

    expect(result).toBeNull();
    expect(prisma.notification.create).not.toHaveBeenCalled();
    expect(sendPushToUser).toHaveBeenCalledOnce();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("suppresses push and email during quiet hours", async () => {
    prisma.user.findFirst.mockResolvedValue({
      email: "member@example.com",
      notificationPreferences: {
        version: 1,
        businesses: {
          biz_1: {
            channels: {
              inApp: true,
              push: true,
              email: true
            },
            quietHours: {
              enabled: true,
              start: "00:00",
              end: "23:59",
              timezone: "Africa/Johannesburg"
            }
          }
        }
      }
    });
    prisma.notification.create.mockResolvedValue({ id: "notif_1" });

    const result = await sendNotification({
      userId: "user_1",
      businessId: "biz_1",
      title: "Store update",
      body: "Quiet test",
      type: "PROMOTION"
    });

    expect(result).toEqual({ id: "notif_1" });
    expect(prisma.notification.create).toHaveBeenCalledOnce();
    expect(sendPushToUser).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
