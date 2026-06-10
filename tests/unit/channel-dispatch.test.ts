import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requirePaidBusinessPlan: vi.fn(),
  shouldDeliverNotificationChannel: vi.fn(),
  getWhatsappCustomerServiceWindowStatus: vi.fn(),
  sendWhatsAppTextMessage: vi.fn(),
  sendWhatsAppTemplateMessage: vi.fn(),
  sendWhatsAppDocumentMessage: vi.fn(),
  prisma: {
    user: { findFirst: vi.fn() },
    userConsent: { findFirst: vi.fn() },
    business: { findFirstOrThrow: vi.fn() },
    message: { create: vi.fn() }
  }
}));

vi.mock("@/server/services/billing.service", () => ({
  requirePaidBusinessPlan: mocks.requirePaidBusinessPlan
}));
vi.mock("@/lib/notification-preferences", () => ({
  shouldDeliverNotificationChannel: mocks.shouldDeliverNotificationChannel
}));
vi.mock("@/server/services/conversation.service", () => ({
  getWhatsappCustomerServiceWindowStatus: mocks.getWhatsappCustomerServiceWindowStatus
}));
vi.mock("@/lib/whatsapp", () => ({
  sendWhatsAppTextMessage: mocks.sendWhatsAppTextMessage,
  sendWhatsAppTemplateMessage: mocks.sendWhatsAppTemplateMessage,
  sendWhatsAppDocumentMessage: mocks.sendWhatsAppDocumentMessage
}));
vi.mock("@/lib/email", () => ({ sendEmail: vi.fn() }));
vi.mock("@/lib/sms", () => ({ sendSms: vi.fn() }));
vi.mock("@/lib/storage", () => ({
  createPresignedDownload: vi.fn(),
  getStoredObjectBuffer: vi.fn()
}));
vi.mock("@/server/services/notification.service", () => ({ sendNotification: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));

const { sendOnChannel } = await import("@/server/services/channel-dispatch.service");
const { MessageChannel } = await import("@prisma/client");

const thread = {
  id: "thread_1",
  businessId: "biz_1",
  contactPhone: "+27821234567",
  userId: "user_1",
  title: "Quote follow-up"
};

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.FOLLOWUP_WHATSAPP_TEMPLATE;
  mocks.requirePaidBusinessPlan.mockResolvedValue("GROWTH");
  mocks.shouldDeliverNotificationChannel.mockReturnValue(true);
  mocks.prisma.user.findFirst.mockResolvedValue({
    id: "user_1",
    email: "customer@example.com",
    notificationPreferences: null
  });
  mocks.prisma.business.findFirstOrThrow.mockResolvedValue({ wabaPhoneId: "12345" });
  mocks.prisma.userConsent.findFirst.mockResolvedValue(null);
  mocks.prisma.message.create.mockResolvedValue({ id: "msg_1" });
  mocks.sendWhatsAppTextMessage.mockResolvedValue({ messageId: "wamid.text" });
  mocks.sendWhatsAppTemplateMessage.mockResolvedValue({ messageId: "wamid.template" });
  mocks.getWhatsappCustomerServiceWindowStatus.mockResolvedValue({ open: true, expiresAt: new Date() });
});

describe("sendOnChannel WhatsApp consent/window policy", () => {
  it("allows in-window transactional WhatsApp sends without marketing consent", async () => {
    const result = await sendOnChannel({
      businessId: "biz_1",
      thread,
      channel: MessageChannel.WHATSAPP,
      body: "Here is the quote you asked for."
    });

    expect(result.externalId).toBe("wamid.text");
    expect(mocks.prisma.userConsent.findFirst).not.toHaveBeenCalled();
    expect(mocks.sendWhatsAppTextMessage).toHaveBeenCalledOnce();
  });

  it("requires marketing consent outside the customer-service window", async () => {
    mocks.getWhatsappCustomerServiceWindowStatus.mockResolvedValue({ open: false, expiresAt: null });

    await expect(sendOnChannel({
      businessId: "biz_1",
      thread,
      channel: MessageChannel.WHATSAPP,
      body: "Checking in on your quote."
    })).rejects.toThrow(/not opted in/i);

    expect(mocks.sendWhatsAppTemplateMessage).not.toHaveBeenCalled();
  });

  it("requires an approved template outside the customer-service window", async () => {
    mocks.getWhatsappCustomerServiceWindowStatus.mockResolvedValue({ open: false, expiresAt: null });
    mocks.prisma.userConsent.findFirst.mockResolvedValue({ id: "consent_1" });

    await expect(sendOnChannel({
      businessId: "biz_1",
      thread,
      channel: MessageChannel.WHATSAPP,
      body: "Checking in on your quote."
    })).rejects.toThrow(/FOLLOWUP_WHATSAPP_TEMPLATE/);
  });

  it("throws when the business has no connected WhatsApp number", async () => {
    mocks.prisma.business.findFirstOrThrow.mockResolvedValue({ wabaPhoneId: null });

    await expect(sendOnChannel({
      businessId: "biz_1",
      thread,
      channel: MessageChannel.WHATSAPP,
      body: "Here is the quote."
    })).rejects.toThrow(/connected WhatsApp number/);
  });
});
