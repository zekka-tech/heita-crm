import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { decryptSecret, encryptSecret } from "@/lib/secret-crypto";

const ORIGINAL_AI_SECRET = process.env.AI_CREDENTIALS_SECRET;
const ORIGINAL_AUTH_SECRET = process.env.AUTH_SECRET;

beforeEach(() => {
  process.env.AI_CREDENTIALS_SECRET = "test-credentials-secret";
});

afterEach(() => {
  process.env.AI_CREDENTIALS_SECRET = ORIGINAL_AI_SECRET;
  process.env.AUTH_SECRET = ORIGINAL_AUTH_SECRET;
});

describe("secret-crypto", () => {
  it("round-trips a secret", () => {
    const ciphertext = encryptSecret("sk-super-secret-key");
    expect(ciphertext).not.toContain("sk-super-secret-key");
    expect(ciphertext.startsWith("v1.")).toBe(true);
    expect(decryptSecret(ciphertext)).toBe("sk-super-secret-key");
  });

  it("produces a fresh IV per encryption", () => {
    const a = encryptSecret("same-input");
    const b = encryptSecret("same-input");
    expect(a).not.toBe(b);
    expect(decryptSecret(a)).toBe("same-input");
    expect(decryptSecret(b)).toBe("same-input");
  });

  it("rejects tampered ciphertext", () => {
    const ciphertext = encryptSecret("sk-super-secret-key");
    const parts = ciphertext.split(".");
    const data = parts[3]!;
    const flipped = data.startsWith("A") ? `B${data.slice(1)}` : `A${data.slice(1)}`;
    parts[3] = flipped;
    expect(() => decryptSecret(parts.join("."))).toThrow();
  });

  it("rejects unrecognised formats", () => {
    expect(() => decryptSecret("v2.a.b.c")).toThrow(/unrecognised/);
    expect(() => decryptSecret("garbage")).toThrow(/unrecognised/);
  });

  it("falls back to AUTH_SECRET when AI_CREDENTIALS_SECRET is unset", () => {
    delete process.env.AI_CREDENTIALS_SECRET;
    process.env.AUTH_SECRET = "auth-secret-fallback";
    const ciphertext = encryptSecret("key-under-auth-secret");
    expect(decryptSecret(ciphertext)).toBe("key-under-auth-secret");
  });

  it("throws when no secret is configured", () => {
    delete process.env.AI_CREDENTIALS_SECRET;
    delete process.env.AUTH_SECRET;
    expect(() => encryptSecret("anything")).toThrow(/AI_CREDENTIALS_SECRET/);
  });
});
