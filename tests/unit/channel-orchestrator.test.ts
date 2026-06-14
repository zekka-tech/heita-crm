import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {
    user: { findFirst: vi.fn() },
    business: { findFirst: vi.fn() },
    userConsent: { findFirst: vi.fn() },
    message: { create: vi.fn() },
    conversationParticipant: { findMany: vi.fn() }
  },
  isUserOnline: vi.fn(),
  shouldDeliverNotificationChannel: vi.fn(),
  sendEmail: vi.fn(),
  sendSms: vi.fn(),
  sendPushToUser: vi.fn(),
  sendNotification: vi.fn(),
  publishEvent: vi.fn(),
  isWithinQuietHours: vi.fn()
}));

vi.mock("@/lib/prisma", () => ({
  prisma: mocks.prisma,
  withBusinessScope: vi.fn(async (_businessId: string, fn: (tx: typeof mocks.prisma) => unknown) =>
    fn(mocks.prisma)
  )
}));

vi.mock("@/server/services/presence.service", () => ({
  isUserOnline: mocks.isUserOnline
}));

vi.mock("@/lib/notification-preferences", () => ({
  getBusinessNotificationPreference: vi.fn(() => ({
    channels: { inApp: true, push: true, email: true, whatsapp: true, sms: true },
    quietHours: null
  })),
  isWithinQuietHours: mocks.isWithinQuietHours,
  normalizeNotificationPreferences: vi.fn((p) => p ?? ({ channels: { inApp: true, push: true, email: true, whatsapp: true, sms: true }, quietHours: null })),
  shouldDeliverNotificationChannel: mocks.shouldDeliverNotificationChannel
}));

vi.mock("@/lib/email", () => ({ sendEmail: mocks.sendEmail }));
vi.mock("@/lib/sms", () => ({ sendSms: mocks.sendSms }));
vi.mock("@/lib/push", () => ({ sendPushToUser: mocks.sendPushToUser }));
vi.mock("@/server/services/notification.service", () => ({
  sendNotification: mocks.sendNotification
}));
vi.mock("@/lib/redis-pubsub", () => ({
  publishEvent: mocks.publishEvent
}));

const { sendMessage } = await import("@/server/services/channel-orchestrator.service");

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.HEITA_CONNECT_ONLY;
  mocks.prisma.user.findFirst.mockResolvedValue({
    id: "user_1",
    email: "test@example.com",
    phone: "+27821234567",
    notificationPreferences: null
  });
  mocks.prisma.business.findFirst.mockResolvedValue(null);
  mocks.prisma.userConsent.findFirst.mockResolvedValue({ id: "consent_1" });
  mocks.prisma.message.create.mockResolvedValue({ id: "msg_1" });
  mocks.isUserOnline.mockResolvedValue(false);
  mocks.isWithinQuietHours.mockReturnValue(false);
  mocks.shouldDeliverNotificationChannel.mockReturnValue(true);
  mocks.sendEmail.mockResolvedValue({ id: "email_1" });
  mocks.sendSms.mockResolvedValue({ messageId: "sms_1", provider: "twilio" });
  mocks.sendPushToUser.mockResolvedValue(undefined);
  mocks.sendNotification.mockResolvedValue({ id: "notif_1" });
  mocks.publishEvent.mockResolvedValue(undefined);
});

describe("channel-orchestrator", () => {
  describe("sendMessage", () => {
    it("sends via IN_APP when user is online", async () => {
      mocks.isUserOnline.mockResolvedValue(true);

      const result = await sendMessage({
        businessId: "biz_1",
        recipientId: "user_1",
        body: "Hello!"
      });

      expect(result.channel).toBe("IN_APP");
      expect(mocks.publishEvent).toHaveBeenCalledWith(
        "user:user_1:events",
        expect.objectContaining({ type: "message.new" })
      );
    });

    it("falls back to push notification when user is offline", async () => {
      mocks.isUserOnline.mockResolvedValue(false);

      const result = await sendMessage({
        businessId: "biz_1",
        recipientId: "user_1",
        body: "Hello!"
      });

      expect(result.channel).toBe("PUSH");
      expect(mocks.sendPushToUser).toHaveBeenCalled();
    });

    it("falls back to SMS when push fails", async () => {
      mocks.isUserOnline.mockResolvedValue(false);
      mocks.sendPushToUser.mockRejectedValue(new Error("No subscriptions"));

      const result = await sendMessage({
        businessId: "biz_1",
        recipientId: "user_1",
        body: "Hello!"
      });

      expect(result.channel).toBe("SMS");
      expect(mocks.sendSms).toHaveBeenCalled();
    });

    it("falls back to email when SMS fails", async () => {
      mocks.isUserOnline.mockResolvedValue(false);
      mocks.sendPushToUser.mockRejectedValue(new Error("No subscriptions"));
      mocks.sendSms.mockRejectedValue(new Error("No phone"));

      const result = await sendMessage({
        businessId: "biz_1",
        recipientId: "user_1",
        body: "Hello!"
      });

      expect(result.channel).toBe("EMAIL");
      expect(mocks.sendEmail).toHaveBeenCalled();
    });

    it("uses notification fallback when all channels fail", async () => {
      mocks.isUserOnline.mockResolvedValue(false);
      mocks.sendPushToUser.mockRejectedValue(new Error("fail"));
      mocks.sendSms.mockRejectedValue(new Error("fail"));
      mocks.sendEmail.mockRejectedValue(new Error("fail"));

      const result = await sendMessage({
        businessId: "biz_1",
        recipientId: "user_1",
        body: "Hello!"
      });

      expect(result.channel).toBe("IN_APP");
      expect(mocks.sendNotification).toHaveBeenCalled();
    });

    it("skips WhatsApp when HEITA_CONNECT_ONLY is true", async () => {
      process.env.HEITA_CONNECT_ONLY = "true";
      mocks.isUserOnline.mockResolvedValue(false);
  mocks.prisma.business.findFirst.mockResolvedValue(null);
      mocks.sendPushToUser.mockRejectedValue(new Error("fail"));
      mocks.sendSms.mockRejectedValue(new Error("fail"));

      const result = await sendMessage({
        businessId: "biz_1",
        recipientId: "user_1",
        body: "Hello!"
      });

      expect(result.channel).toBe("EMAIL");
    });

    it("respects quiet hours for push and email", async () => {
      mocks.isUserOnline.mockResolvedValue(false);
      mocks.isWithinQuietHours.mockReturnValue(true);

      const result = await sendMessage({
        businessId: "biz_1",
        recipientId: "user_1",
        body: "Hello!"
      });

      expect(result.channel).toBe("SMS");
    });

    it("respects specified channel override", async () => {
      mocks.isUserOnline.mockResolvedValue(false);
      mocks.sendPushToUser.mockRejectedValue(new Error("fail"));
      mocks.sendSms.mockRejectedValue(new Error("fail"));

      const result = await sendMessage({
        businessId: "biz_1",
        recipientId: "user_1",
        body: "Hello!",
        channel: "EMAIL" as const
      });

      expect(result.channel).toBe("EMAIL");
    });

    it("throws when recipient is not found", async () => {
      mocks.prisma.user.findFirst.mockResolvedValue(null);

      await expect(
        sendMessage({
          businessId: "biz_1",
          recipientId: "user_unknown",
          body: "Hello!"
        })
      ).rejects.toThrow("Recipient not found.");
    });
  });
});
