import { MessageChannel, MessageStatus } from "@prisma/client";

import { logger } from "@/lib/logger";
import {
  getBusinessNotificationPreference,
  isWithinQuietHours,
  normalizeNotificationPreferences,
  shouldDeliverNotificationChannel
} from "@/lib/notification-preferences";
import { prisma, withBusinessScope } from "@/lib/prisma";
import { publishEvent } from "@/lib/redis-pubsub";
import { sendEmail } from "@/lib/email";
import { sendSms } from "@/lib/sms";
import { sendPushToUser } from "@/lib/push";
import { isUserOnline } from "@/server/services/presence.service";
import { sendNotification } from "@/server/services/notification.service";

type SendMessageInput = {
  businessId: string;
  recipientId: string;
  conversationId?: string;
  body: string;
  subject?: string;
  channel?: MessageChannel;
  attachments?: {
    mediaType: string;
    mimeType?: string;
    fileName?: string;
    byteSize?: number;
    storageKey?: string;
    sourceUrl?: string;
  }[];
};

type ChannelResult = {
  channel: MessageChannel;
  messageId: string;
  status: MessageStatus;
  provider: string;
};

const CHANNEL_PRIORITY: MessageChannel[] = [
  "IN_APP",
  "WHATSAPP",
  "PUSH",
  "SMS",
  "EMAIL"
];

function isConnectOnlyMode(): boolean {
  return process.env.HEITA_CONNECT_ONLY === "true";
}

async function hasWhatsAppConnectivity(businessId: string): Promise<boolean> {
  const business = await prisma.business.findFirst({
    where: { id: businessId, deletedAt: null },
    select: { wabaPhoneId: true }
  });
  return Boolean(business?.wabaPhoneId);
}

async function hasWhatsAppConsent(userId: string, businessId: string): Promise<boolean> {
  const consent = await prisma.userConsent.findFirst({
    where: {
      userId,
      businessId,
      type: "WHATSAPP_MARKETING",
      revokedAt: null
    },
    select: { id: true }
  });
  return Boolean(consent);
}

async function getUserContactInfo(userId: string) {
  return prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: {
      id: true,
      email: true,
      phone: true,
      notificationPreferences: true
    }
  });
}

async function createMessageRecord(input: {
  businessId: string;
  userId: string | null;
  conversationId: string | null;
  channel: MessageChannel;
  body: string;
  externalId?: string | null;
  metadata?: Record<string, unknown>;
  attachments?: SendMessageInput["attachments"];
  contactPhone?: string | null;
}): Promise<{ id: string }> {
  return withBusinessScope(input.businessId, (tx) =>
    tx.message.create({
      data: {
        businessId: input.businessId,
        userId: input.userId,
        conversationId: input.conversationId,
        contactPhone: input.contactPhone ?? null,
        channel: input.channel,
        direction: "OUTBOUND",
        externalId: input.externalId ?? null,
        status: "SENT",
        body: input.body,
        sentAt: new Date(),
        metadata: input.metadata,
        attachments: input.attachments?.length
          ? {
              create: input.attachments.map((att) => ({
                mediaType: att.mediaType,
                mimeType: att.mimeType ?? null,
                fileName: att.fileName ?? null,
                byteSize: att.byteSize ?? null,
                storageKey: att.storageKey ?? null,
                sourceUrl: att.sourceUrl ?? null
              }))
            }
          : undefined
      },
      select: { id: true }
    })
  );
}

export async function sendMessage(input: SendMessageInput): Promise<ChannelResult> {
  const user = await getUserContactInfo(input.recipientId);

  if (!user) {
    throw new Error("Recipient not found.");
  }

  const prefs = normalizeNotificationPreferences(user.notificationPreferences);
  const businessPref = getBusinessNotificationPreference(prefs, input.businessId);
  const quietHoursActive = isWithinQuietHours({ quietHours: businessPref.quietHours });

  const isOnline = await isUserOnline(input.recipientId);
  const hasWaAccess = await hasWhatsAppConnectivity(input.businessId);
  const hasWaConsent = await hasWhatsAppConsent(input.recipientId, input.businessId);

  const connectOnly = isConnectOnlyMode();
  const availableChannels = connectOnly
    ? CHANNEL_PRIORITY.filter((c) => c !== "WHATSAPP")
    : CHANNEL_PRIORITY;

  for (const channel of availableChannels) {
    if (input.channel && input.channel !== channel) continue;

    try {
      if (channel === "IN_APP") {
        if (!isOnline) continue;

        const message = await createMessageRecord({
          businessId: input.businessId,
          userId: input.recipientId,
          conversationId: input.conversationId ?? null,
          channel: "IN_APP",
          body: input.body,
          externalId: null,
          attachments: input.attachments,
          metadata: { provider: "in-app" }
        });

        await publishEvent(`user:${input.recipientId}:events`, {
          type: "message.new",
          message: {
            id: message.id,
            conversationId: input.conversationId,
            body: input.body,
            direction: "OUTBOUND",
            status: "DELIVERED",
            sentAt: new Date().toISOString(),
            senderId: null,
            attachments: input.attachments
          }
        });

        return { channel: "IN_APP", messageId: message.id, status: "DELIVERED", provider: "in-app" };
      }

      if (channel === "WHATSAPP") {
        if (connectOnly || !hasWaAccess) continue;

        if (
          !shouldDeliverNotificationChannel({
            preferences: prefs,
            businessId: input.businessId,
            channel: "whatsapp"
          })
        ) {
          continue;
        }

        if (!hasWaConsent) continue;

        const message = await createMessageRecord({
          businessId: input.businessId,
          userId: input.recipientId,
          conversationId: null,
          channel: "WHATSAPP",
          body: input.body,
          contactPhone: user.phone,
          externalId: null,
          attachments: input.attachments,
          metadata: { provider: "whatsapp-orchestrator" }
        });

        return { channel: "WHATSAPP", messageId: message.id, status: "QUEUED", provider: "whatsapp" };
      }

      if (channel === "PUSH") {
        if (!shouldDeliverNotificationChannel({ preferences: prefs, businessId: input.businessId, channel: "push" }) || quietHoursActive) {
          continue;
        }

        try {
          await sendPushToUser({
            userId: input.recipientId,
            title: input.subject ?? "New message",
            body: input.body,
            url: `/connect?businessId=${input.businessId}`
          });
        } catch {
          continue;
        }

        const message = await createMessageRecord({
          businessId: input.businessId,
          userId: input.recipientId,
          conversationId: input.conversationId ?? null,
          channel: "PUSH",
          body: input.body,
          metadata: { provider: "push" }
        });

        return { channel: "PUSH", messageId: message.id, status: "SENT", provider: "push" };
      }

      if (channel === "SMS") {
        if (!user.phone) continue;

        try {
          await sendSms({ to: user.phone, body: input.body });
        } catch {
          continue;
        }

        const message = await createMessageRecord({
          businessId: input.businessId,
          userId: input.recipientId,
          conversationId: input.conversationId ?? null,
          channel: "SMS",
          body: input.body,
          contactPhone: user.phone,
          metadata: { provider: "sms" }
        });

        return { channel: "SMS", messageId: message.id, status: "SENT", provider: "sms" };
      }

      if (channel === "EMAIL") {
        if (!user.email || !shouldDeliverNotificationChannel({ preferences: prefs, businessId: input.businessId, channel: "email" }) || quietHoursActive) {
          continue;
        }

        try {
          await sendEmail({
            to: user.email,
            subject: input.subject ?? "New message",
            text: input.body,
            html: `<p>${input.body}</p>`
          });
        } catch {
          continue;
        }

        const message = await createMessageRecord({
          businessId: input.businessId,
          userId: input.recipientId,
          conversationId: input.conversationId ?? null,
          channel: "EMAIL",
          body: input.body,
          metadata: { provider: "email" }
        });

        return { channel: "EMAIL", messageId: message.id, status: "SENT", provider: "email" };
      }
    } catch (err) {
      logger.warn({ err, channel, businessId: input.businessId }, "channel-orchestrator.send.channel_failed");
    }
  }

  const fallback = await sendNotification({
    userId: input.recipientId,
    businessId: input.businessId,
    title: input.subject ?? "New message",
    body: input.body,
    type: "in_app_message",
    actionUrl: `/connect?businessId=${input.businessId}`
  });

  const message = await createMessageRecord({
    businessId: input.businessId,
    userId: input.recipientId,
    conversationId: input.conversationId ?? null,
    channel: "IN_APP",
    body: input.body,
    metadata: { provider: "notification-fallback" }
  });

  return {
    channel: "IN_APP",
    messageId: message.id,
    status: fallback ? "SENT" : "FAILED",
    provider: "notification"
  };
}
