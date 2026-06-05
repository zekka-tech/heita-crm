import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  listWhatsAppMessageTemplates,
  sendWhatsAppInteractiveButtonsMessage,
  sendWhatsAppInteractiveListMessage,
  sendWhatsAppTemplateMessage,
  sendWhatsAppTextMessage
} from "@/lib/whatsapp";

const originalAccessToken = process.env.WHATSAPP_ACCESS_TOKEN;
const originalVersion = process.env.WHATSAPP_API_VERSION;
const originalWabaId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;

beforeEach(() => {
  process.env.WHATSAPP_ACCESS_TOKEN = "test-token";
  process.env.WHATSAPP_API_VERSION = "v99.0";
  process.env.WHATSAPP_BUSINESS_ACCOUNT_ID = "waba_123";
  vi.unstubAllGlobals();
});

function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}

afterEach(() => {
  restoreEnv("WHATSAPP_ACCESS_TOKEN", originalAccessToken);
  restoreEnv("WHATSAPP_API_VERSION", originalVersion);
  restoreEnv("WHATSAPP_BUSINESS_ACCOUNT_ID", originalWabaId);
});

describe("whatsapp client", () => {
  it("sends text payloads with normalized recipients", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.to).toBe("27821234567");
      expect(body.type).toBe("text");

      return new Response(
        JSON.stringify({
          messages: [{ id: "wamid.text" }]
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" }
        }
      );
    });

    vi.stubGlobal("fetch", fetchMock);

    const result = await sendWhatsAppTextMessage({
      phoneNumberId: "1234",
      to: "+27 82 123 4567",
      body: "Hello"
    });

    expect(result.messageId).toBe("wamid.text");
  });

  it("sends template payloads with body components", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.type).toBe("template");
      expect(body.template.name).toBe("heita_join_invite");
      expect(body.template.components[0].parameters[0].text).toBe("Heita Retail");

      return new Response(
        JSON.stringify({
          messages: [{ id: "wamid.template" }]
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" }
        }
      );
    });

    vi.stubGlobal("fetch", fetchMock);

    const result = await sendWhatsAppTemplateMessage({
      phoneNumberId: "1234",
      to: "27821234567",
      name: "heita_join_invite",
      components: [
        {
          type: "body",
          parameters: [{ type: "text", text: "Heita Retail" }]
        }
      ]
    });

    expect(result.messageId).toBe("wamid.template");
  });

  it("sends interactive button payloads", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.type).toBe("interactive");
      expect(body.interactive.type).toBe("button");
      expect(body.interactive.action.buttons).toHaveLength(2);
      expect(body.interactive.action.buttons[0].reply.title).toBe("Join now");

      return new Response(JSON.stringify({ messages: [{ id: "wamid.buttons" }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    });

    vi.stubGlobal("fetch", fetchMock);

    const result = await sendWhatsAppInteractiveButtonsMessage({
      phoneNumberId: "1234",
      to: "+27 82 123 4567",
      body: "Pick an option",
      buttons: [
        { id: "join", title: "Join now" },
        { id: "rewards", title: "See rewards" }
      ]
    });

    expect(result.messageId).toBe("wamid.buttons");
  });

  it("sends interactive list payloads", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.type).toBe("interactive");
      expect(body.interactive.type).toBe("list");
      expect(body.interactive.action.button).toBe("Choose");
      expect(body.interactive.action.sections[0].rows[0].title).toBe("Redeem reward");

      return new Response(JSON.stringify({ messages: [{ id: "wamid.list" }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    });

    vi.stubGlobal("fetch", fetchMock);

    const result = await sendWhatsAppInteractiveListMessage({
      phoneNumberId: "1234",
      to: "27821234567",
      body: "Select an action",
      buttonLabel: "Choose",
      rows: [
        { id: "redeem", title: "Redeem reward", description: "Use your points" }
      ]
    });

    expect(result.messageId).toBe("wamid.list");
  });
});

describe("listWhatsAppMessageTemplates", () => {
  it("returns null when the WABA id is not configured", async () => {
    delete process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await listWhatsAppMessageTemplates();

    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns null when the access token is missing", async () => {
    delete process.env.WHATSAPP_ACCESS_TOKEN;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await listWhatsAppMessageTemplates();

    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps Meta's template list and queries the configured WABA via GET", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toContain("/waba_123/message_templates");
      expect(init?.method).toBe("GET");

      return new Response(
        JSON.stringify({
          data: [
            { name: "heita_event_reminder", status: "APPROVED", category: "UTILITY", language: "en_ZA" },
            { name: "heita_promotion", status: "PENDING", category: "MARKETING", language: "en_ZA" },
            { name: "", status: "APPROVED" }
          ]
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await listWhatsAppMessageTemplates();

    expect(result).toEqual([
      { name: "heita_event_reminder", status: "APPROVED", category: "UTILITY", language: "en_ZA" },
      { name: "heita_promotion", status: "PENDING", category: "MARKETING", language: "en_ZA" }
    ]);
  });
});
