import { sendWhatsAppTemplateMessage } from "@/lib/whatsapp";
import { logOutboundWhatsappMessage } from "@/server/services/whatsapp-shared";

// Inbound webhook handling lives in whatsapp-inbound.service; re-export the
// entry point so existing `@/server/services/whatsapp.service` imports keep
// working.
export { handleWhatsappInboundPayload } from "@/server/services/whatsapp-inbound.service";

// Proactive WhatsApp sends require a pre-approved Meta template. The event
// reminder template (default "heita_event_reminder") has three body params:
//   {{1}} business name   {{2}} event title   {{3}} when label
const EVENT_REMINDER_TEMPLATE =
  process.env.WHATSAPP_EVENT_REMINDER_TEMPLATE ?? "heita_event_reminder";
const EVENT_REMINDER_TEMPLATE_LANG =
  process.env.WHATSAPP_EVENT_REMINDER_TEMPLATE_LANG ?? "en_ZA";

// Marketing template for promotion broadcasts (default "heita_promotion").
// Three body params: {{1}} business name, {{2}} promotion title, {{3}} details.
const PROMOTION_TEMPLATE =
  process.env.WHATSAPP_PROMOTION_TEMPLATE ?? "heita_promotion";
const PROMOTION_TEMPLATE_LANG =
  process.env.WHATSAPP_PROMOTION_TEMPLATE_LANG ?? "en_ZA";

/**
 * Sends an event-reminder WhatsApp template to a single member and records the
 * outbound message. Throws on send failure so callers can count it as a
 * delivery failure; eligibility (consent, channel opt-in, phone, wabaPhoneId)
 * must be checked by the caller before invoking this.
 */
export async function sendEventReminderWhatsApp(input: {
  businessId: string;
  wabaPhoneId: string;
  userId: string;
  toPhone: string;
  businessName: string;
  eventTitle: string;
  whenLabel: string;
}): Promise<void> {
  const response = await sendWhatsAppTemplateMessage({
    phoneNumberId: input.wabaPhoneId,
    to: input.toPhone,
    name: EVENT_REMINDER_TEMPLATE,
    languageCode: EVENT_REMINDER_TEMPLATE_LANG,
    components: [
      {
        type: "body",
        parameters: [
          { type: "text", text: input.businessName },
          { type: "text", text: input.eventTitle },
          { type: "text", text: input.whenLabel }
        ]
      }
    ]
  });

  await logOutboundWhatsappMessage({
    businessId: input.businessId,
    userId: input.userId,
    contactPhone: input.toPhone,
    externalId: response.messageId,
    body: `Event reminder: ${input.eventTitle}`,
    metadata: { template: EVENT_REMINDER_TEMPLATE, kind: "event_reminder" }
  });
}

/**
 * Sends a promotion-broadcast WhatsApp template to a single member and records
 * the outbound message. Throws on send failure so callers can count it as a
 * delivery failure; eligibility (consent, channel opt-in, phone, wabaPhoneId)
 * must be checked by the caller before invoking this.
 */
export async function sendPromotionWhatsApp(input: {
  businessId: string;
  wabaPhoneId: string;
  userId: string;
  toPhone: string;
  businessName: string;
  promotionTitle: string;
  details: string;
}): Promise<void> {
  const response = await sendWhatsAppTemplateMessage({
    phoneNumberId: input.wabaPhoneId,
    to: input.toPhone,
    name: PROMOTION_TEMPLATE,
    languageCode: PROMOTION_TEMPLATE_LANG,
    components: [
      {
        type: "body",
        parameters: [
          { type: "text", text: input.businessName },
          { type: "text", text: input.promotionTitle },
          { type: "text", text: input.details }
        ]
      }
    ]
  });

  await logOutboundWhatsappMessage({
    businessId: input.businessId,
    userId: input.userId,
    contactPhone: input.toPhone,
    externalId: response.messageId,
    body: `Promotion: ${input.promotionTitle}`,
    metadata: { template: PROMOTION_TEMPLATE, kind: "promotion" }
  });
}
