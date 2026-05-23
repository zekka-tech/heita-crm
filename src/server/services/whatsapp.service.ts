import { JoinChannel, MessageChannel } from "@prisma/client";
import { z } from "zod";

import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { sendWhatsAppTextMessage } from "@/lib/whatsapp";

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
                      text: z
                        .object({
                          body: z.string()
                        })
                        .optional(),
                      type: z.string()
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

      const business = await prisma.business.findUnique({
        where: { wabaPhoneId: metadata.phone_number_id }
      });

      if (!business) {
        logger.warn(
          { phoneNumberId: metadata.phone_number_id },
          "whatsapp.payload.unknown_business"
        );
        continue;
      }

      for (const message of messages) {
        if (message.type !== "text" || !message.text?.body) continue;
        await routeInboundTextToBusiness({
          businessId: business.id,
          businessSlug: business.slug,
          businessName: business.name,
          wabaPhoneId: metadata.phone_number_id,
          fromPhone: `+${message.from}`,
          externalId: message.id,
          body: message.text.body
        });
      }
    }
  }
}

async function persistStatusUpdates(
  statuses: { id: string; status: string; timestamp: string }[]
): Promise<void> {
  for (const status of statuses) {
    await prisma.message.updateMany({
      where: { externalId: status.id },
      data: {
        metadata: {
          status: status.status,
          updatedAt: status.timestamp
        }
      }
    });
  }
}

type RouteInput = {
  businessId: string;
  businessSlug: string;
  businessName: string;
  wabaPhoneId: string;
  fromPhone: string;
  externalId: string;
  body: string;
};

async function routeInboundTextToBusiness(input: RouteInput): Promise<void> {
  const existingUser = await prisma.user.findFirst({
    where: { phone: input.fromPhone }
  });

  await prisma.message.create({
    data: {
      businessId: input.businessId,
      userId: existingUser?.id ?? null,
      channel: MessageChannel.WHATSAPP,
      direction: "INBOUND",
      externalId: input.externalId,
      body: input.body,
      metadata: { fromPhone: input.fromPhone }
    }
  });

  if (!existingUser) {
    await sendOnboardingPrompt(input);
    return;
  }

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

  // Membership exists: future RAG-powered reply pipeline plugs in here.
  // Intentionally minimal in this commit; AI worker handles the actual response.
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

async function sendOnboardingPrompt(input: RouteInput): Promise<void> {
  const link = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/sign-in?callbackUrl=/b/${input.businessSlug}/join`;
  try {
    await sendWhatsAppTextMessage({
      phoneNumberId: input.wabaPhoneId,
      to: input.fromPhone.replace(/^\+/, ""),
      body: `Hi! Sign up to ${input.businessName}'s loyalty programme: ${link}`
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
    await sendWhatsAppTextMessage({
      phoneNumberId: input.wabaPhoneId,
      to: input.fromPhone.replace(/^\+/, ""),
      body: `Welcome back. Join ${input.businessName}'s loyalty programme here: ${link}`
    });
  } catch (error) {
    logger.error({ err: error }, "whatsapp.send.join_invite_failed");
  }
}
