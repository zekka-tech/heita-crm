import { describe, expect, it } from "vitest";

import {
  constantTimeEqual,
  hmacSha256,
  isUnixTimestampWithinSkew,
  isPrivateIp,
  verifyMetaWhatsappSignature
} from "@/lib/security";

describe("constantTimeEqual", () => {
  it("returns true on equal strings", () => {
    expect(constantTimeEqual("hello", "hello")).toBe(true);
  });

  it("returns false on different strings", () => {
    expect(constantTimeEqual("hello", "world")).toBe(false);
  });

  it("returns false on different lengths without throwing", () => {
    expect(constantTimeEqual("a", "ab")).toBe(false);
  });
});

describe("hmacSha256", () => {
  it("produces deterministic output", () => {
    const a = hmacSha256("secret", "hello");
    const b = hmacSha256("secret", "hello");
    expect(a).toBe(b);
  });

  it("varies with secret", () => {
    expect(hmacSha256("a", "x")).not.toBe(hmacSha256("b", "x"));
  });
});

describe("verifyMetaWhatsappSignature", () => {
  const body = '{"object":"whatsapp_business_account"}';
  const secret = "test-app-secret";

  it("accepts valid signature", () => {
    const signature = `sha256=${hmacSha256(secret, body)}`;
    expect(
      verifyMetaWhatsappSignature({
        rawBody: body,
        signatureHeader: signature,
        appSecret: secret
      })
    ).toBe(true);
  });

  it("rejects tampered body", () => {
    const signature = `sha256=${hmacSha256(secret, body)}`;
    expect(
      verifyMetaWhatsappSignature({
        rawBody: body + " ",
        signatureHeader: signature,
        appSecret: secret
      })
    ).toBe(false);
  });

  it("rejects wrong secret", () => {
    const signature = `sha256=${hmacSha256("other", body)}`;
    expect(
      verifyMetaWhatsappSignature({
        rawBody: body,
        signatureHeader: signature,
        appSecret: secret
      })
    ).toBe(false);
  });

  it("rejects missing signature header", () => {
    expect(
      verifyMetaWhatsappSignature({
        rawBody: body,
        signatureHeader: null,
        appSecret: secret
      })
    ).toBe(false);
  });
});

describe("isPrivateIp", () => {
  it("flags localhost", () => {
    expect(isPrivateIp("127.0.0.1")).toBe(true);
    expect(isPrivateIp("::1")).toBe(true);
  });

  it("flags RFC1918", () => {
    expect(isPrivateIp("10.1.2.3")).toBe(true);
    expect(isPrivateIp("192.168.0.1")).toBe(true);
    expect(isPrivateIp("172.16.0.1")).toBe(true);
    expect(isPrivateIp("172.31.255.255")).toBe(true);
  });

  it("does not flag public addresses", () => {
    expect(isPrivateIp("8.8.8.8")).toBe(false);
    expect(isPrivateIp("196.201.213.55")).toBe(false);
  });
});

describe("isUnixTimestampWithinSkew", () => {
  it("accepts timestamps within the allowed window", () => {
    const now = Date.UTC(2026, 0, 1, 12, 0, 0);
    const timestamp = Math.floor((now - 2 * 60 * 1000) / 1000);

    expect(isUnixTimestampWithinSkew(timestamp, 5 * 60, now)).toBe(true);
  });

  it("rejects stale timestamps", () => {
    const now = Date.UTC(2026, 0, 1, 12, 0, 0);
    const timestamp = Math.floor((now - 10 * 60 * 1000) / 1000);

    expect(isUnixTimestampWithinSkew(timestamp, 5 * 60, now)).toBe(false);
  });
});
