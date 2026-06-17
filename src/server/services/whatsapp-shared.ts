import { MessageChannel, MessageStatus, Prisma } from "@prisma/client";

import { withBusinessScope } from "@/lib/prisma";

// Records an outbound WhatsApp message for audit + retention. Shared by the
// proactive template senders (whatsapp.service) and the inbound auto-reply
// paths (whatsapp-inbound.service).
export async function logOutboundWhatsappMessage(input: {
  businessId: string;
  userId?: string | null;
  contactPhone: string;
  externalId?: string | null;
  body: string;
  status?: MessageStatus | null;
  metadata?: Record<string, unknown>;
}) {
  await withBusinessScope(input.businessId, (tx) =>
    tx.message.create({
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
    })
  );
}
