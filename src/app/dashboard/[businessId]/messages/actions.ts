"use server";

import { MessageChannel, StaffRole } from "@prisma/client";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { requireCsrfFormData } from "@/lib/csrf";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/staff";
import { requireFreshStaffStepUp } from "@/lib/staff-step-up";
import { getWhatsappCustomerServiceWindowStatus } from "@/server/services/conversation.service";
import { recordStaffAuditLog } from "@/server/services/staff-audit.service";

export async function sendWhatsappReplyAction(formData: FormData) {
  await requireCsrfFormData(formData);

  const session = await auth();
  const userId = session?.user?.id;
  const businessId = String(formData.get("businessId") ?? "");
  const contactPhone = String(formData.get("contactPhone") ?? "");
  const messageMode = String(formData.get("messageMode") ?? "text").trim();
  const body = String(formData.get("body") ?? "").trim();
  const templateName = String(formData.get("templateName") ?? "").trim();
  const footer = String(formData.get("footer") ?? "").trim();
  const listButtonLabel = String(formData.get("listButtonLabel") ?? "").trim();
  const listSectionTitle = String(formData.get("listSectionTitle") ?? "").trim();
  const interactiveButtons = parseInteractiveButtons(
    String(formData.get("interactiveButtons") ?? "")
  );
  const interactiveListRows = parseInteractiveListRows(
    String(formData.get("interactiveListRows") ?? "")
  );

  if (!userId) {
    redirect(`/sign-in?callbackUrl=/dashboard/${businessId}/messages`);
  }

  await requireRole({
    businessId,
    userId,
    allowedRoles: [StaffRole.STAFF]
  });

  await requireFreshStaffStepUp({ businessId, userId });

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

  if (messageMode === "text" && !templateName && !serviceWindow.open) {
    throw new Error(
      "Free-text WhatsApp replies are only allowed within 24 hours of the customer's last inbound message. Use an approved template instead."
    );
  }

  let response: { messageId: string | null };
  if (messageMode === "template" || templateName) {
    const { sendWhatsAppTemplateMessage } = await import("@/lib/whatsapp");
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
  } else if (messageMode === "interactive-buttons") {
    if (!body || interactiveButtons.length === 0) {
      throw new Error("Interactive button messages require body text and at least one button.");
    }

    const { sendWhatsAppInteractiveButtonsMessage } = await import(
      "@/lib/whatsapp"
    );
    response = await sendWhatsAppInteractiveButtonsMessage({
      phoneNumberId: business.wabaPhoneId,
      to: contactPhone,
      body,
      footer: footer || undefined,
      buttons: interactiveButtons
    });
  } else if (messageMode === "interactive-list") {
    if (!body || !listButtonLabel || interactiveListRows.length === 0) {
      throw new Error(
        "Interactive list messages require body text, a button label, and at least one list row."
      );
    }

    const { sendWhatsAppInteractiveListMessage } = await import("@/lib/whatsapp");
    response = await sendWhatsAppInteractiveListMessage({
      phoneNumberId: business.wabaPhoneId,
      to: contactPhone,
      body,
      footer: footer || undefined,
      buttonLabel: listButtonLabel,
      sectionTitle: listSectionTitle || undefined,
      rows: interactiveListRows
    });
  } else {
    if (!body) {
      throw new Error("Reply text is required when no template is selected.");
    }

    const { sendWhatsAppTextMessage } = await import("@/lib/whatsapp");
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
        body:
          body ||
          (messageMode === "interactive-list"
            ? `Interactive list sent`
            : `Template sent: ${templateName}`),
        metadata:
          messageMode === "interactive-buttons"
            ? { buttons: interactiveButtons, footer: footer || null }
            : messageMode === "interactive-list"
              ? {
                  listButtonLabel,
                  listSectionTitle: listSectionTitle || null,
                  rows: interactiveListRows,
                  footer: footer || null
                }
              : templateName
                ? { templateName }
                : undefined,
        sentAt: new Date()
      }
    });

    await recordStaffAuditLog(
      {
        businessId,
        actorUserId: userId,
        action:
          messageMode === "interactive-buttons" || messageMode === "interactive-list"
            ? "MESSAGE_INTERACTIVE_SEND"
            : templateName
              ? "MESSAGE_TEMPLATE_SEND"
              : "MESSAGE_TEXT_SEND",
        targetType: "Message",
        targetId: message.id,
        metadata: {
          channel: "WHATSAPP",
          contactPhone,
          messageMode,
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

function parseInteractiveButtons(raw: string) {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 3)
    .flatMap((line, index) => {
      const parts = line.split("|").map((value) => value.trim());
      const id = parts[0] || `btn-${index + 1}`;
      const title = parts[1] || parts[0] || "";
      if (!title) return [];
      return [{ id, title }];
    });
}

function parseInteractiveListRows(raw: string) {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 10)
    .flatMap((line, index) => {
      const parts = line.split("|").map((value) => value.trim());
      const id = parts[0] || `row-${index + 1}`;
      const title = parts[1] || parts[0] || "";
      const description = parts[2] || undefined;
      if (!title) return [];
      return [{ id, title, description }];
    });
}
