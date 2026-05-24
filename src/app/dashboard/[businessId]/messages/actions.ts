"use server";

import { MessageChannel, StaffRole } from "@prisma/client";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/staff";
import {
  sendWhatsAppTemplateMessage,
  sendWhatsAppTextMessage
} from "@/lib/whatsapp";

export async function sendWhatsappReplyAction(formData: FormData) {
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

  await prisma.message.create({
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

  redirect(
    `/dashboard/${businessId}/messages?contactPhone=${encodeURIComponent(contactPhone)}&sent=1`
  );
}
