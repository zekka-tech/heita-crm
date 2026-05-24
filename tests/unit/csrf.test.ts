import { describe, expect, it, vi } from "vitest";

import {
  CSRF_COOKIE,
  CSRF_HEADER,
  generateCsrfToken,
  isValidCsrfToken,
  verifyCsrfFormData,
  verifyCsrfRequest
} from "@/lib/csrf";

vi.mock("next/headers", () => ({
  cookies: vi.fn()
}));

const { cookies: mockedCookies } = await import("next/headers");

function stubCookies(value: string | null) {
  (mockedCookies as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
    get: (name: string) =>
      name === CSRF_COOKIE && value !== null ? { value } : undefined
  });
}

describe("generateCsrfToken", () => {
  it("produces tokens that match the validation regex", () => {
    const token = generateCsrfToken();
    expect(isValidCsrfToken(token)).toBe(true);
  });

  it("produces distinct values across calls", () => {
    const a = generateCsrfToken();
    const b = generateCsrfToken();
    expect(a).not.toBe(b);
  });
});

describe("isValidCsrfToken", () => {
  it("rejects empty or obviously malformed strings", () => {
    expect(isValidCsrfToken("")).toBe(false);
    expect(isValidCsrfToken("../etc/passwd")).toBe(false);
    expect(isValidCsrfToken("short")).toBe(false);
  });
});

describe("verifyCsrfRequest", () => {
  it("fails when the cookie is missing", async () => {
    const request = new Request("https://heita.test/api/x", {
      method: "POST",
      headers: { [CSRF_HEADER]: generateCsrfToken() }
    });
    await expect(verifyCsrfRequest(request)).resolves.toEqual({
      ok: false,
      reason: "missing-cookie"
    });
  });

  it("fails when the header is missing", async () => {
    const token = generateCsrfToken();
    const request = new Request("https://heita.test/api/x", {
      method: "POST",
      headers: { cookie: `${CSRF_COOKIE}=${token}` }
    });
    await expect(verifyCsrfRequest(request)).resolves.toEqual({
      ok: false,
      reason: "missing-token"
    });
  });

  it("fails when header does not match cookie", async () => {
    const cookieToken = generateCsrfToken();
    const request = new Request("https://heita.test/api/x", {
      method: "POST",
      headers: {
        [CSRF_HEADER]: generateCsrfToken(),
        cookie: `${CSRF_COOKIE}=${cookieToken}`
      }
    });
    await expect(verifyCsrfRequest(request)).resolves.toEqual({
      ok: false,
      reason: "mismatch"
    });
  });

  it("passes when header matches cookie", async () => {
    const token = generateCsrfToken();
    const request = new Request("https://heita.test/api/x", {
      method: "POST",
      headers: {
        [CSRF_HEADER]: token,
        cookie: `${CSRF_COOKIE}=${token}`
      }
    });
    await expect(verifyCsrfRequest(request)).resolves.toEqual({ ok: true });
  });
});

describe("verifyCsrfFormData", () => {
  it("requires the cookie", async () => {
    stubCookies(null);
    const form = new FormData();
    form.set("_csrf", generateCsrfToken());
    await expect(verifyCsrfFormData(form)).resolves.toEqual({
      ok: false,
      reason: "missing-cookie"
    });
  });

  it("requires the form field", async () => {
    stubCookies(generateCsrfToken());
    const form = new FormData();
    await expect(verifyCsrfFormData(form)).resolves.toEqual({
      ok: false,
      reason: "missing-token"
    });
  });

  it("accepts a matching token", async () => {
    const token = generateCsrfToken();
    stubCookies(token);
    const form = new FormData();
    form.set("_csrf", token);
    await expect(verifyCsrfFormData(form)).resolves.toEqual({ ok: true });
  });
});
