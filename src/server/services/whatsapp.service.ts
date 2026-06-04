import { JoinChannel, MessageChannel, MessageStatus } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { isUnixTimestampWithinSkew } from "@/lib/security";
import { putStoredObject, storageConfigured } from "@/lib/storage";
import {
  downloadWhatsAppMedia,
  sendWhatsAppTemplateMessage,
  sendWhatsAppTextMessage
} from "@/lib/whatsapp";

const WEBHOOK_TIMESTAMP_SKEW_SECONDS = 5 * 60;

const InboundTextMessageSchema = z.object({
  object: z.string().optional(),
  entry: z
    .array(
      z.object({
        changes: z
          .array(
            z.object({
              value: z.object({
                metadata: z
                  .object({
                    phone_number_id: z.string()
                  })
                  .optional(),
                messages: z
                  .array(
                    z.object({
                      from: z.string(),
                      id: z.string(),
                      timestamp: z.string(),
                      type: z.string(),
                      text: z
                        .object({
                          body: z.string()
                        })
                        .optional(),
                      image: z
                        .object({
                          id: z.string(),
                          mime_type: z.string().optional(),
                          caption: z.string().optional()
                        })
                        .optional(),
                      audio: z
                        .object({
                          id: z.string(),
                          mime_type: z.string().optional()
                        })
                        .optional(),
                      video: z
                        .object({
                          id: z.string(),
                          mime_type: z.string().optional(),
                          caption: z.string().optional()
                        })
                        .optional(),
                      document: z
                        .object({
                          id: z.string(),
                          mime_type: z.string().optional(),
                          filename: z.string().optional(),
                          caption: z.string().optional()
                        })
                        .optional()
                    })
                  )
                  .optional(),
                statuses: z
                  .array(
                    z.object({
                      id: z.string(),
                      status: z.string(),
                      timestamp: z.string()
                    })
                  )
                  .optional()
              })
            })
          )
          .optional()
      })
    )
    .optional()
});

type InboundMessage = NonNullable<
  NonNullable<
    NonNullable<
      NonNullable<z.infer<typeof InboundTextMessageSchema>["entry"]>[number]["changes"]
    >[number]["value"]["messages"]
  >[number]
>;

type RouteInput = {
  businessId: string;
  businessSlug: string;
  businessName: string;
  wabaPhoneId: string;
  fromPhone: string;
  externalId: string;
  body: string;
  mediaMessage?: InboundMessage | null;
};

function toE164(phone: string) {
  return `+${phone.replace(/^\+/, "")}`;
}

function getMessageBody(message: InboundMessage) {
  if (message.type === "text" && message.text?.body) {
    return message.text.body;
  }

  if (message.type === "image") {
    return message.image?.caption?.trim() || "[Image]";
  }

  if (message.type === "video") {
    return message.video?.caption?.trim() || "[Video]";
  }

  if (message.type === "audio") {
    return "[Audio]";
  }

  if (message.type === "document") {
    return message.document?.caption?.trim() || `[Document] ${message.document?.filename ?? ""}`.trim();
  }

  return `[${message.type}]`;
}

function getMediaDescriptor(message: InboundMessage) {
  if (message.image?.id) {
    return {
      mediaId: message.image.id,
      mediaType: "image",
      mimeType: message.image.mime_type,
      fileName: null
    };
  }

  if (message.audio?.id) {
    return {
      mediaId: message.audio.id,
      mediaType: "audio",
      mimeType: message.audio.mime_type,
      fileName: null
    };
  }

  if (message.video?.id) {
    return {
      mediaId: message.video.id,
      mediaType: "video",
      mimeType: message.video.mime_type,
      fileName: null
    };
  }

  if (message.document?.id) {
    return {
      mediaId: message.document.id,
      mediaType: "document",
      mimeType: message.document.mime_type,
      fileName: message.document.filename ?? null
    };
  }

  return null;
}

async function logOutboundWhatsappMessage(input: {
  businessId: string;
  userId?: string | null;
  contactPhone: string;
  externalId?: string | null;
  body: string;
  status?: MessageStatus | null;
  metadata?: Record<string, unknown>;
}) {
  await prisma.message.create({
    data: {
      businessId: input.businessId,
      userId: input.userId ?? null,
      contactPhone: input.contactPhone,
      channel: MessageChannel.WHATSAPP,
      direction: "OUTBOUND",
      externalId: input.externalId ?? null,
      status: input.status ?? MessageStatus.QUEUED,
      body: input.body,
      metadata: input.metadata as Prisma.InputJsonValue | undefined,
      sentAt: new Date()
    }
  });
}

async function persistStatusUpdates(
  statuses: { id: string; status: string; timestamp: string }[]
): Promise<void> {
  for (const status of statuses) {
    if (!isUnixTimestampWithinSkew(status.timestamp, WEBHOOK_TIMESTAMP_SKEW_SECONDS)) {
      logger.warn(
        { externalId: status.id, timestamp: status.timestamp },
        "whatsapp.payload.stale_status"
      );
      continue;
    }

    await prisma.message.updateMany({
      where: { externalId: status.id },
      data: {
        status: status.status as MessageStatus,
        metadata: {
          status: status.status,
          updatedAt: status.timestamp
        }
      }
    });
  }
}

async function persistInboundMediaAttachment(input: {
  messageId: string;
  businessId: string;
  externalId: string;
  mediaMessage: InboundMessage;
}) {
  const media = getMediaDescriptor(input.mediaMessage);
  if (!media) {
    return;
  }

  try {
    let storageKey: string | null = null;
    let sourceUrl: string | null = null;
    let byteSize: number | null = null;
    let mimeType = media.mimeType ?? null;

    if (storageConfigured()) {
      const downloaded = await downloadWhatsAppMedia({
        mediaId: media.mediaId
      });

      mimeType = downloaded.metadata.mime_type ?? mimeType;
      byteSize = downloaded.metadata.file_size ?? downloaded.buffer.byteLength;
      const extension =
        mimeType?.split("/")[1]?.replace(/[^a-zA-Z0-9.+-]/g, "") ??
        media.fileName?.split(".").pop() ??
        "bin";

      storageKey = `businesses/${input.businessId}/messages/${input.externalId}-${media.mediaType}.${extension}`;
      const stored = await putStoredObject({
        key: storageKey,
        body: downloaded.buffer,
        contentType: mimeType ?? undefined
      });
      sourceUrl = stored.url ?? null;
    }

    await prisma.messageAttachment.create({
      data: {
        messageId: input.messageId,
        mediaType: media.mediaType,
        mimeType,
        fileName: media.fileName,
        byteSize,
        externalMediaId: media.mediaId,
        storageKey,
        sourceUrl
      }
    });
  } catch (error) {
    logger.error(
      {
        err: error,
        externalId: input.externalId
      },
      "whatsapp.media.persist_failed"
    );
  }
}

export async function handleWhatsappInboundPayload(payload: unknown): Promise<void> {
  const parsed = InboundTextMessageSchema.safeParse(payload);

  if (!parsed.success) {
    logger.warn(
      { issues: parsed.error.issues.slice(0, 3) },
      "whatsapp.payload.unrecognised"
    );
    return;
  }

  for (const entry of parsed.data.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const { metadata, messages, statuses } = change.value;
      if (statuses?.length) {
        await persistStatusUpdates(statuses);
      }

      if (!messages?.length || !metadata?.phone_number_id) continue;

      const business = await prisma.business.findFirst({
        where: {
          wabaPhoneId: metadata.phone_number_id,
          deletedAt: null
        }
      });

      if (!business) {
        logger.warn(
          { phoneNumberId: metadata.phone_number_id },
          "whatsapp.payload.unknown_business"
        );
        continue;
      }

      for (const message of messages) {
        if (!isUnixTimestampWithinSkew(message.timestamp, WEBHOOK_TIMESTAMP_SKEW_SECONDS)) {
          logger.warn(
            { externalId: message.id, timestamp: message.timestamp },
            "whatsapp.payload.stale_message"
          );
          continue;
        }

        await routeInboundToBusiness({
          businessId: business.id,
          businessSlug: business.slug,
          businessName: business.name,
          wabaPhoneId: metadata.phone_number_id,
          fromPhone: toE164(message.from),
          externalId: message.id,
          body: getMessageBody(message),
          mediaMessage: message
        });
      }
    }
  }
}

async function routeInboundToBusiness(input: RouteInput): Promise<void> {
  const existingMessage = await prisma.message.findFirst({
    where: {
      channel: MessageChannel.WHATSAPP,
      externalId: input.externalId
    },
    select: {
      id: true
    }
  });

  if (existingMessage) {
    logger.info({ externalId: input.externalId }, "whatsapp.payload.duplicate_ignored");
    return;
  }

  const existingUser = await prisma.user.findFirst({
    where: { phone: input.fromPhone, deletedAt: null }
  });

  const inboundMessage = await prisma.message.create({
    data: {
      businessId: input.businessId,
      userId: existingUser?.id ?? null,
      contactPhone: input.fromPhone,
      channel: MessageChannel.WHATSAPP,
      direction: "INBOUND",
      externalId: input.externalId,
      status: MessageStatus.RECEIVED,
      body: input.body,
      metadata: { fromPhone: input.fromPhone }
    }
  });

  if (input.mediaMessage && getMediaDescriptor(input.mediaMessage)) {
    await persistInboundMediaAttachment({
      messageId: inboundMessage.id,
      businessId: input.businessId,
      externalId: input.externalId,
      mediaMessage: input.mediaMessage
    });
  }

  if (!existingUser) {
    await sendOnboardingPrompt(input);
    return;
  }

  const optedOut = await handleOptOut({ ...input, existingUser });
  if (optedOut) return;

  const membership = await prisma.membership.findUnique({
    where: {
      businessId_userId: {
        businessId: input.businessId,
        userId: existingUser.id
      }
    }
  });

  if (!membership) {
    await sendJoinInvite({
      ...input,
      userId: existingUser.id,
      joinChannel: JoinChannel.WHATSAPP_BOT
    });
    return;
  }

  await prisma.aiChatSession.upsert({
    where: { id: `wa_${membership.id}` },
    update: {},
    create: {
      id: `wa_${membership.id}`,
      businessId: input.businessId,
      workspaceId: (
        await prisma.aiWorkspace.findUniqueOrThrow({
          where: { businessId: input.businessId }
        })
      ).id,
      userId: existingUser.id,
      title: `WhatsApp · ${input.fromPhone.slice(-4)}`
    }
  });
}

const OPT_OUT_KEYWORDS = ["stop", "unsubscribe", "unstop", "cancel", "end", "quit"];

function isOptOutRequest(body: string): boolean {
  const trimmed = body.trim().toLowerCase();
  return OPT_OUT_KEYWORDS.some(
    (keyword) => trimmed === keyword || trimmed.startsWith(`${keyword} `) || trimmed.startsWith(`${keyword}\n`)
  );
}

async function handleOptOut(
  input: RouteInput & { existingUser: { id: string } }
): Promise<boolean> {
  if (!isOptOutRequest(input.body)) return false;

  const userId = input.existingUser.id;

  await prisma.userConsent.updateMany({
    where: {
      userId,
      type: "WHATSAPP_MARKETING",
      revokedAt: null
    },
    data: { revokedAt: new Date() }
  });

  logger.info(
    { userId, fromPhone: input.fromPhone, businessId: input.businessId },
    "whatsapp.opt_out_processed"
  );

  try {
    const confirmation = "You've been unsubscribed from marketing messages. Reply HELP for assistance.";
    const response = await sendWhatsAppTextMessage({
      phoneNumberId: input.wabaPhoneId,
      to: input.fromPhone,
      body: confirmation
    });
    await logOutboundWhatsappMessage({
      businessId: input.businessId,
      userId,
      contactPhone: input.fromPhone,
      externalId: response.messageId,
      body: confirmation,
      status: MessageStatus.SENT,
      metadata: { kind: "opt_out_confirmation" }
    });
  } catch (error) {
    logger.error({ err: error, fromPhone: input.fromPhone }, "whatsapp.opt_out_reply_failed");
  }

  return true;
}

async function sendOnboardingPrompt(input: RouteInput): Promise<void> {
  const link = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/sign-in?callbackUrl=/b/${input.businessSlug}/join`;
  const body = `Hi! Sign up to ${input.businessName}'s loyalty programme: ${link}`;
  try {
    const response = await sendWhatsAppTextMessage({
      phoneNumberId: input.wabaPhoneId,
      to: input.fromPhone,
      body
    });
    await logOutboundWhatsappMessage({
      businessId: input.businessId,
      contactPhone: input.fromPhone,
      externalId: response.messageId,
      body,
      status: MessageStatus.SENT,
      metadata: { kind: "onboarding_prompt" }
    });
  } catch (error) {
    logger.error({ err: error }, "whatsapp.send.onboarding_failed");
  }
}

async function sendJoinInvite(
  input: RouteInput & { userId: string; joinChannel: JoinChannel }
): Promise<void> {
  const link = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/b/${input.businessSlug}/join?channel=${input.joinChannel}`;
  try {
    const response = await sendWhatsAppTemplateMessage({
      phoneNumberId: input.wabaPhoneId,
      to: input.fromPhone,
      name: "heita_join_invite",
      components: [
        {
          type: "body",
          parameters: [
            { type: "text", text: input.businessName },
            { type: "text", text: link }
          ]
        }
      ]
    }).catch(async () =>
      sendWhatsAppTextMessage({
        phoneNumberId: input.wabaPhoneId,
        to: input.fromPhone,
        body: `Welcome back. Join ${input.businessName}'s loyalty programme here: ${link}`
      })
    );

    await logOutboundWhatsappMessage({
      businessId: input.businessId,
      userId: input.userId,
      contactPhone: input.fromPhone,
      externalId: response.messageId,
      body: `Join invite sent for ${input.businessName}`,
      status: MessageStatus.SENT,
      metadata: { kind: "join_invite", joinChannel: input.joinChannel }
    });
  } catch (error) {
    logger.error({ err: error }, "whatsapp.send.join_invite_failed");
  }
}
