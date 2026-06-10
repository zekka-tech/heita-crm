import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { sendSms } from "@/lib/sms";

const originalApiKey = process.env.AT_API_KEY;
const originalUsername = process.env.AT_USERNAME;
const originalSender = process.env.AT_SENDER_ID;

function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

beforeEach(() => {
  vi.unstubAllGlobals();
  delete process.env.AT_API_KEY;
  delete process.env.AT_USERNAME;
  delete process.env.AT_SENDER_ID;
});

afterEach(() => {
  restoreEnv("AT_API_KEY", originalApiKey);
  restoreEnv("AT_USERNAME", originalUsername);
  restoreEnv("AT_SENDER_ID", originalSender);
});

describe("sendSms", () => {
  it("returns a development result when Africa's Talking is not configured", async () => {
    const result = await sendSms({ to: "+27821234567", body: "Hello" });
    expect(result).toEqual({ provider: "development", to: "+27821234567", body: "Hello" });
  });

  it("posts general SMS messages to Africa's Talking", async () => {
    process.env.AT_API_KEY = "key";
    process.env.AT_USERNAME = "heita";
    process.env.AT_SENDER_ID = "HEITA";
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.method).toBe("POST");
      const body = new URLSearchParams(String(init?.body));
      expect(body.get("username")).toBe("heita");
      expect(body.get("to")).toBe("+27821234567");
      expect(body.get("message")).toBe("Sales follow-up");
      expect(body.get("from")).toBe("HEITA");
      return new Response(JSON.stringify({
        SMSMessageData: { Recipients: [{ status: "Success", messageId: "sms_1" }] }
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendSms({ to: "+27821234567", body: "Sales follow-up" });
    expect(result.messageId).toBe("sms_1");
  });
});
