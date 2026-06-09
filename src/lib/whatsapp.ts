import { runWithCircuitBreaker } from "@/lib/circuit-breaker";
import { appendTraceHeaders } from "@/lib/tracing";

const baseUrl = "https://graph.facebook.com";

type WhatsAppTemplateComponent = {
  type: "header" | "body" | "button";
  sub_type?: "quick_reply" | "url";
  index?: string;
  parameters: Array<
    | { type: "text"; text: string }
    | { type: "payload"; payload: string }
  >;
};

type InteractiveButton = {
  id: string;
  title: string;
};

type InteractiveListRow = {
  id: string;
  title: string;
  description?: string;
};

type RequestOptions = {
  method?: "GET" | "POST";
  body?: unknown;
  signal?: AbortSignal;
  retryable?: boolean;
  absoluteUrl?: string;
  responseType?: "json" | "arrayBuffer";
};

type GraphMessageResponse = {
  messages?: Array<{ id?: string }>;
};

type MediaMetadataResponse = {
  id: string;
  mime_type?: string;
  sha256?: string;
  file_size?: number;
  url: string;
};

function getAccessToken() {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!accessToken) {
    throw new Error("WHATSAPP_ACCESS_TOKEN is missing.");
  }

  return accessToken;
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestWhatsApp<T>(path: string, options: RequestOptions = {}) {
  const url =
    options.absoluteUrl ||
    `${baseUrl}/${process.env.WHATSAPP_API_VERSION ?? "v21.0"}/${path.replace(/^\//, "")}`;
  const retries = options.retryable ? 3 : 1;
  const accessToken = getAccessToken();

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    const signal = options.signal ?? AbortSignal.timeout(30_000);

    try {
      const response = await runWithCircuitBreaker("whatsapp.graph", () =>
        fetch(url, {
          method: options.method ?? "POST",
          headers: appendTraceHeaders({
            Authorization: `Bearer ${accessToken}`,
            ...(options.body ? { "Content-Type": "application/json" } : {})
          }),
          body: options.body ? JSON.stringify(options.body) : undefined,
          signal
        })
      );

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(
          `WhatsApp API failed (${response.status}): ${text.slice(0, 200)}`
        );
      }

      if (options.responseType === "arrayBuffer") {
        return (await response.arrayBuffer()) as T;
      }

      return (await response.json()) as T;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("WhatsApp request failed.");
      if (!options.retryable || attempt >= retries) {
        break;
      }
      const delayMs = 250 * 2 ** (attempt - 1) + Math.floor(Math.random() * 120);
      await sleep(delayMs);
    }
  }

  throw lastError ?? new Error("WhatsApp request failed.");
}

function normalizeRecipient(to: string) {
  return to.replace(/[^\d]/g, "");
}

function getMessageId(payload: GraphMessageResponse) {
  return payload.messages?.[0]?.id ?? null;
}

export async function sendWhatsAppTextMessage(input: {
  phoneNumberId: string;
  to: string;
  body: string;
}) {
  const payload = await requestWhatsApp<GraphMessageResponse>(
    `${input.phoneNumberId}/messages`,
    {
      body: {
        messaging_product: "whatsapp",
        to: normalizeRecipient(input.to),
        type: "text",
        text: { body: input.body }
      }
    }
  );

  return {
    payload,
    messageId: getMessageId(payload)
  };
}

export type WhatsAppTemplateStatus =
  | "APPROVED"
  | "PENDING"
  | "REJECTED"
  | "PAUSED"
  | "DISABLED"
  | "IN_APPEAL"
  | "PENDING_DELETION"
  | (string & {});

export type WhatsAppMessageTemplate = {
  name: string;
  status: WhatsAppTemplateStatus;
  category: string | null;
  language: string | null;
};

type GraphTemplateListResponse = {
  data?: Array<{
    name?: string;
    status?: string;
    category?: string;
    language?: string;
  }>;
};

/**
 * Lists message templates for a WhatsApp Business Account (WABA) from the Meta
 * Graph API. Heita's automated templates are platform-owned, so the WABA id
 * comes from WHATSAPP_BUSINESS_ACCOUNT_ID. Returns null when WhatsApp is not
 * configured so callers can render an unconfigured state instead of erroring.
 */
export async function listWhatsAppMessageTemplates(options?: {
  wabaId?: string;
  limit?: number;
}): Promise<WhatsAppMessageTemplate[] | null> {
  const wabaId = options?.wabaId ?? process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
  if (!wabaId || !process.env.WHATSAPP_ACCESS_TOKEN) {
    return null;
  }

  const limit = options?.limit ?? 200;
  const payload = await requestWhatsApp<GraphTemplateListResponse>(
    `${wabaId}/message_templates?fields=name,status,category,language&limit=${limit}`,
    { method: "GET", retryable: true }
  );

  return (payload.data ?? [])
    .filter((template): template is { name: string } & typeof template =>
      Boolean(template.name)
    )
    .map((template) => ({
      name: template.name,
      status: (template.status ?? "UNKNOWN") as WhatsAppTemplateStatus,
      category: template.category ?? null,
      language: template.language ?? null
    }));
}

export async function sendWhatsAppTemplateMessage(input: {
  phoneNumberId: string;
  to: string;
  name: string;
  languageCode?: string;
  components?: WhatsAppTemplateComponent[];
}) {
  const payload = await requestWhatsApp<GraphMessageResponse>(
    `${input.phoneNumberId}/messages`,
    {
      body: {
        messaging_product: "whatsapp",
        to: normalizeRecipient(input.to),
        type: "template",
        template: {
          name: input.name,
          language: {
            code: input.languageCode ?? "en_ZA"
          },
          components: input.components ?? []
        }
      }
    }
  );

  return {
    payload,
    messageId: getMessageId(payload)
  };
}

export async function sendWhatsAppInteractiveButtonsMessage(input: {
  phoneNumberId: string;
  to: string;
  body: string;
  footer?: string;
  buttons: InteractiveButton[];
}) {
  const payload = await requestWhatsApp<GraphMessageResponse>(
    `${input.phoneNumberId}/messages`,
    {
      body: {
        messaging_product: "whatsapp",
        to: normalizeRecipient(input.to),
        type: "interactive",
        interactive: {
          type: "button",
          body: { text: input.body },
          ...(input.footer ? { footer: { text: input.footer } } : {}),
          action: {
            buttons: input.buttons.map((button) => ({
              type: "reply",
              reply: {
                id: button.id,
                title: button.title
              }
            }))
          }
        }
      }
    }
  );

  return {
    payload,
    messageId: getMessageId(payload)
  };
}

export async function sendWhatsAppInteractiveListMessage(input: {
  phoneNumberId: string;
  to: string;
  body: string;
  buttonLabel: string;
  sectionTitle?: string;
  footer?: string;
  rows: InteractiveListRow[];
}) {
  const payload = await requestWhatsApp<GraphMessageResponse>(
    `${input.phoneNumberId}/messages`,
    {
      body: {
        messaging_product: "whatsapp",
        to: normalizeRecipient(input.to),
        type: "interactive",
        interactive: {
          type: "list",
          body: { text: input.body },
          ...(input.footer ? { footer: { text: input.footer } } : {}),
          action: {
            button: input.buttonLabel,
            sections: [
              {
                ...(input.sectionTitle ? { title: input.sectionTitle } : {}),
                rows: input.rows.map((row) => ({
                  id: row.id,
                  title: row.title,
                  ...(row.description ? { description: row.description } : {})
                }))
              }
            ]
          }
        }
      }
    }
  );

  return {
    payload,
    messageId: getMessageId(payload)
  };
}

export async function fetchWhatsAppMediaMetadata(mediaId: string) {
  return requestWhatsApp<MediaMetadataResponse>(mediaId, {
    method: "GET",
    retryable: true
  });
}

export async function downloadWhatsAppMedia(input: { mediaId: string }) {
  const metadata = await fetchWhatsAppMediaMetadata(input.mediaId);
  const file = await requestWhatsApp<ArrayBuffer>("", {
    method: "GET",
    absoluteUrl: metadata.url,
    retryable: true,
    responseType: "arrayBuffer"
  });

  return {
    buffer: Buffer.from(file),
    metadata
  };
}
