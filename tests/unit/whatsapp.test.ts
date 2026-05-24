import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  sendWhatsAppTemplateMessage,
  sendWhatsAppTextMessage
} from "@/lib/whatsapp";

const originalAccessToken = process.env.WHATSAPP_ACCESS_TOKEN;
const originalVersion = process.env.WHATSAPP_API_VERSION;

beforeEach(() => {
  process.env.WHATSAPP_ACCESS_TOKEN = "test-token";
  process.env.WHATSAPP_API_VERSION = "v99.0";
  vi.unstubAllGlobals();
});

afterEach(() => {
  if (originalAccessToken === undefined) {
    delete process.env.WHATSAPP_ACCESS_TOKEN;
  } else {
    process.env.WHATSAPP_ACCESS_TOKEN = originalAccessToken;
  }

  if (originalVersion === undefined) {
    delete process.env.WHATSAPP_API_VERSION;
  } else {
    process.env.WHATSAPP_API_VERSION = originalVersion;
  }
});

describe("whatsapp client", () => {
  it("sends text payloads with normalized recipients", async () => {
    const fetchMock = vi.fn(async (_input, init) => {
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
    const fetchMock = vi.fn(async (_input, init) => {
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
});
