"use server";

import { MessageChannel, StaffRole } from "@prisma/client";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { requireCsrfFormData } from "@/lib/csrf";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/staff";
import {
  sendWhatsAppTemplateMessage,
  sendWhatsAppTextMessage
} from "@/lib/whatsapp";
import { getWhatsappCustomerServiceWindowStatus } from "@/server/services/conversation.service";
import { recordStaffAuditLog } from "@/server/services/staff-audit.service";

export async function sendWhatsappReplyAction(formData: FormData) {
  await requireCsrfFormData(formData);

  const session = await auth();
  const userId = session?.user?.id;
  const businessId = String(formData.get("businessId") ?? "");
  const contactPhone = String(formData.get("contactPhone") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  const templateName = String(formData.get("templateName") ?? "").trim();

  if (!userId) {
    redirect(`/sign-in?callbackUrl=/dashboard/${businessId}/messages`);
  }

  await requireRole({
    businessId,
    userId,
    allowedRoles: [StaffRole.STAFF]
  });

  const business = await prisma.business.findUniqueOrThrow({
    where: {
      id: businessId
    }
  });

  if (!business.wabaPhoneId) {
    throw new Error("This business does not have a connected WhatsApp number.");
  }

  const serviceWindow = await getWhatsappCustomerServiceWindowStatus({
    businessId,
    contactPhone
  });

  if (!templateName && !serviceWindow.open) {
    throw new Error(
      "Free-text WhatsApp replies are only allowed within 24 hours of the customer's last inbound message. Use an approved template instead."
    );
  }

  let response: { messageId: string | null };
  if (templateName) {
    response = await sendWhatsAppTemplateMessage({
      phoneNumberId: business.wabaPhoneId,
      to: contactPhone,
      name: templateName,
      components: body
        ? [
            {
              type: "body",
              parameters: [{ type: "text", text: body }]
            }
          ]
        : undefined
    });
  } else {
    if (!body) {
      throw new Error("Reply text is required when no template is selected.");
    }

    response = await sendWhatsAppTextMessage({
      phoneNumberId: business.wabaPhoneId,
      to: contactPhone,
      body
    });
  }

  await prisma.$transaction(async (tx) => {
    const message = await tx.message.create({
      data: {
        businessId,
        contactPhone,
        channel: MessageChannel.WHATSAPP,
        direction: "OUTBOUND",
        externalId: response.messageId,
        status: "sent",
        body: body || `Template sent: ${templateName}`,
        metadata: templateName ? { templateName } : undefined,
        sentAt: new Date()
      }
    });

    await recordStaffAuditLog(
      {
        businessId,
        actorUserId: userId,
        action: templateName ? "MESSAGE_TEMPLATE_SEND" : "MESSAGE_TEXT_SEND",
        targetType: "Message",
        targetId: message.id,
        metadata: {
          channel: "WHATSAPP",
          contactPhone,
          templateName: templateName || null,
          externalId: response.messageId
        }
      },
      tx
    );
  });

  redirect(
    `/dashboard/${businessId}/messages?contactPhone=${encodeURIComponent(contactPhone)}&sent=1`
  );
}
