import { MessageChannel, MessageStatus } from "@prisma/client";

import { sendEmail } from "@/lib/email";
import { shouldDeliverNotificationChannel } from "@/lib/notification-preferences";
import { prisma } from "@/lib/prisma";
import { sendSms } from "@/lib/sms";
import { createPresignedDownload, getStoredObjectBuffer } from "@/lib/storage";
import {
  sendWhatsAppDocumentMessage,
  sendWhatsAppTemplateMessage,
  sendWhatsAppTextMessage
} from "@/lib/whatsapp";
import { requirePaidBusinessPlan } from "@/server/services/billing.service";
import { getWhatsappCustomerServiceWindowStatus } from "@/server/services/conversation.service";
import { sendNotification } from "@/server/services/notification.service";

type DispatchThread = {
  id: string;
  businessId: string;
  contactPhone: string;
  userId: string | null;
  title: string;
};

type DispatchDocument = {
  id: string;
  fileName: string;
  mimeType: string;
  byteSize: number;
  storageKey: string;
  title: string;
} | null;

export type ChannelDispatchResult = {
  channel: MessageChannel;
  messageId: string;
  externalId: string | null;
  status: MessageStatus;
  provider: string;
};

async function hasConsent(input: { userId: string | null; businessId: string; type: "WHATSAPP_MARKETING" | "EMAIL_MARKETING" }) {
  if (!input.userId) return false;
  const consent = await prisma.userConsent.findFirst({
    where: {
      userId: input.userId,
      businessId: input.businessId,
      type: input.type,
      revokedAt: null
    },
    select: { id: true }
  });
  return Boolean(consent);
}

async function getCustomerUser(userId: string | null, businessId: string) {
  if (!userId) return null;
  return prisma.user.findFirst({
    where: { id: userId },
    select: { id: true, email: true, notificationPreferences: true }
  }).then((user) => user ? { ...user, businessId } : null);
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  })[char] ?? char);
}

async function createMessage(input: {
  businessId: string;
  userId: string | null;
  contactPhone: string;
  salesThreadId: string;
  channel: MessageChannel;
  body: string;
  externalId: string | null;
  metadata?: Record<string, unknown>;
  document?: DispatchDocument;
}) {
  return prisma.message.create({
    data: {
      businessId: input.businessId,
      userId: input.userId,
      contactPhone: input.contactPhone,
      channel: input.channel,
      direction: "OUTBOUND",
      externalId: input.externalId,
      status: MessageStatus.SENT,
      body: input.body,
      salesThreadId: input.salesThreadId,
      sentAt: new Date(),
      metadata: input.metadata,
      attachments: input.document
        ? {
            create: {
              mediaType: "document",
              mimeType: input.document.mimeType,
              fileName: input.document.fileName,
              byteSize: input.document.byteSize,
              storageKey: input.document.storageKey
            }
          }
        : undefined
    },
    select: { id: true }
  });
}

async function documentUrl(document: DispatchDocument) {
  if (!document) return null;
  return createPresignedDownload({ key: document.storageKey, expiresInSeconds: 15 * 60 });
}

export async function sendOnChannel(input: {
  businessId: string;
  thread: DispatchThread;
  channel: MessageChannel;
  body: string;
  document?: DispatchDocument;
}) : Promise<ChannelDispatchResult> {
  await requirePaidBusinessPlan(input.businessId, "Sales messaging");
  const user = await getCustomerUser(input.thread.userId, input.businessId);
  const text = input.body.trim();
  if (!text) {
    throw new Error("Message body is required.");
  }

  if (input.channel === MessageChannel.WHATSAPP) {
    const business = await prisma.business.findFirstOrThrow({
      where: { id: input.businessId },
      select: { wabaPhoneId: true }
    });
    if (!business.wabaPhoneId) {
      throw new Error("This business does not have a connected WhatsApp number.");
    }

    const serviceWindow = await getWhatsappCustomerServiceWindowStatus({
      businessId: input.businessId,
      contactPhone: input.thread.contactPhone
    });

    if (user && !shouldDeliverNotificationChannel({ preferences: user.notificationPreferences, businessId: input.businessId, channel: "whatsapp" })) {
      throw new Error("Customer notification preferences block WhatsApp at this time.");
    }

    let externalId: string | null = null;
    let provider = "whatsapp";
    if (!serviceWindow.open) {
      const optedIn = await hasConsent({
        userId: input.thread.userId,
        businessId: input.businessId,
        type: "WHATSAPP_MARKETING"
      });
      if (!optedIn) {
        throw new Error("Customer has not opted in to WhatsApp marketing messages.");
      }

      const template = process.env.FOLLOWUP_WHATSAPP_TEMPLATE;
      if (!template) {
        throw new Error("WhatsApp follow-ups outside the 24-hour customer-service window require FOLLOWUP_WHATSAPP_TEMPLATE.");
      }
      const response = await sendWhatsAppTemplateMessage({
        phoneNumberId: business.wabaPhoneId,
        to: input.thread.contactPhone,
        name: template,
        components: [
          { type: "body", parameters: [{ type: "text", text }] }
        ]
      });
      externalId = response.messageId;
      provider = "whatsapp-template";
    } else if (input.document) {
      const link = await documentUrl(input.document);
      if (!link) throw new Error("Document URL could not be generated for WhatsApp.");
      const response = await sendWhatsAppDocumentMessage({
        phoneNumberId: business.wabaPhoneId,
        to: input.thread.contactPhone,
        link,
        fileName: input.document.fileName,
        caption: text
      });
      externalId = response.messageId;
    } else {
      const response = await sendWhatsAppTextMessage({
        phoneNumberId: business.wabaPhoneId,
        to: input.thread.contactPhone,
        body: text
      });
      externalId = response.messageId;
    }

    const message = await createMessage({
      businessId: input.businessId,
      userId: input.thread.userId,
      contactPhone: input.thread.contactPhone,
      salesThreadId: input.thread.id,
      channel: input.channel,
      body: text,
      externalId,
      document: input.document ?? null,
      metadata: { provider }
    });

    return { channel: input.channel, messageId: message.id, externalId, status: MessageStatus.SENT, provider };
  }

  if (input.channel === MessageChannel.EMAIL) {
    if (!user?.email) throw new Error("Customer has no email address.");
    if (!shouldDeliverNotificationChannel({ preferences: user.notificationPreferences, businessId: input.businessId, channel: "email" })) {
      throw new Error("Customer notification preferences block email at this time.");
    }
    let attachments: { filename: string; content: string; contentType?: string }[] | undefined;
    if (input.document) {
      const buffer = await getStoredObjectBuffer(input.document.storageKey);
      attachments = [{
        filename: input.document.fileName,
        content: buffer.toString("base64"),
        contentType: input.document.mimeType
      }];
    }
    const response = await sendEmail({
      to: user.email,
      subject: input.thread.title,
      text,
      html: "<p>" + escapeHtml(text).replace(/\n/g, "<br />") + "</p>",
      tag: "marketing",
      userId: user.id,
      attachments
    });
    const externalId = typeof response === "object" && response && "id" in response ? String(response.id) : null;
    const message = await createMessage({
      businessId: input.businessId,
      userId: input.thread.userId,
      contactPhone: input.thread.contactPhone,
      salesThreadId: input.thread.id,
      channel: input.channel,
      body: text,
      externalId,
      document: input.document ?? null,
      metadata: { provider: "resend" }
    });
    return { channel: input.channel, messageId: message.id, externalId, status: MessageStatus.SENT, provider: "resend" };
  }

  if (input.channel === MessageChannel.SMS) {
    const link = input.document ? await documentUrl(input.document) : null;
    const body = link ? (text + "\n" + link).slice(0, 1500) : text;
    const response = await sendSms({ to: input.thread.contactPhone, body });
    const externalId = "messageId" in response ? response.messageId ?? null : null;
    const message = await createMessage({
      businessId: input.businessId,
      userId: input.thread.userId,
      contactPhone: input.thread.contactPhone,
      salesThreadId: input.thread.id,
      channel: input.channel,
      body,
      externalId,
      document: input.document ?? null,
      metadata: { provider: response.provider }
    });
    return { channel: input.channel, messageId: message.id, externalId, status: MessageStatus.SENT, provider: String(response.provider) };
  }

  if (input.channel === MessageChannel.IN_APP || input.channel === MessageChannel.PUSH) {
    if (!input.thread.userId) throw new Error("In-app messages require a linked customer account.");
    const actionUrl = "/wallet?businessId=" + encodeURIComponent(input.businessId) + "&salesThreadId=" + encodeURIComponent(input.thread.id);
    await sendNotification({
      userId: input.thread.userId,
      businessId: input.businessId,
      title: input.thread.title,
      body: text,
      type: "sales_document",
      actionUrl,
      metadata: input.document ? { documentId: input.document.id } : undefined
    });
    const message = await createMessage({
      businessId: input.businessId,
      userId: input.thread.userId,
      contactPhone: input.thread.contactPhone,
      salesThreadId: input.thread.id,
      channel: MessageChannel.IN_APP,
      body: text,
      externalId: null,
      document: input.document ?? null,
      metadata: { provider: "notification", actionUrl }
    });
    return { channel: MessageChannel.IN_APP, messageId: message.id, externalId: null, status: MessageStatus.SENT, provider: "notification" };
  }

  throw new Error("Unsupported sales channel: " + input.channel);
}
