import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { turnstileConfigured, verifyTurnstileToken } from "@/lib/turnstile";

const originalSecret = process.env.TURNSTILE_SECRET_KEY;
const originalSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
const originalE2eExposeDevOtp = process.env.E2E_EXPOSE_DEV_OTP;

beforeEach(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  if (originalSecret === undefined) {
    delete process.env.TURNSTILE_SECRET_KEY;
  } else {
    process.env.TURNSTILE_SECRET_KEY = originalSecret;
  }

  if (originalSiteKey === undefined) {
    delete process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  } else {
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = originalSiteKey;
  }

  if (originalE2eExposeDevOtp === undefined) {
    delete process.env.E2E_EXPOSE_DEV_OTP;
  } else {
    process.env.E2E_EXPOSE_DEV_OTP = originalE2eExposeDevOtp;
  }
});

describe("turnstileConfigured", () => {
  it("requires both site key and secret", () => {
    delete process.env.TURNSTILE_SECRET_KEY;
    delete process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
    expect(turnstileConfigured()).toBe(false);

    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = "abc";
    expect(turnstileConfigured()).toBe(false);

    process.env.TURNSTILE_SECRET_KEY = "xyz";
    expect(turnstileConfigured()).toBe(true);
  });
});

describe("verifyTurnstileToken — production mode with partial config", () => {
  it("bypasses verification when the CI OTP flag is enabled", async () => {
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "");
    vi.stubEnv("TURNSTILE_SECRET_KEY", "");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("E2E_EXPOSE_DEV_OTP", "1");

    const result = await verifyTurnstileToken({ token: null });
    expect(result).toEqual({ ok: true, action: "bypass-e2e" });

    vi.unstubAllEnvs();
  });

  it("returns {ok:false} in production when only the site key is set (no secret)", async () => {
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "site-key-only");
    vi.stubEnv("TURNSTILE_SECRET_KEY", "");
    vi.stubEnv("NODE_ENV", "production");

    const result = await verifyTurnstileToken({ token: "some-token" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("turnstile-not-configured");
    }

    vi.unstubAllEnvs();
  });

  it("returns {ok:false} in production when only the secret is set (no site key)", async () => {
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "");
    vi.stubEnv("TURNSTILE_SECRET_KEY", "secret-only");
    vi.stubEnv("NODE_ENV", "production");

    const result = await verifyTurnstileToken({ token: "some-token" });
    expect(result.ok).toBe(false);

    vi.unstubAllEnvs();
  });
});

describe("verifyTurnstileToken", () => {
  it("bypasses verification when Turnstile is not configured", async () => {
    delete process.env.TURNSTILE_SECRET_KEY;
    delete process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
    const result = await verifyTurnstileToken({ token: null });
    expect(result.ok).toBe(true);
  });

  it("fails when token is missing in production mode", async () => {
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = "site";
    process.env.TURNSTILE_SECRET_KEY = "secret";
    const result = await verifyTurnstileToken({ token: "" });
    expect(result.ok).toBe(false);
  });

  it("accepts a verified token via fetch", async () => {
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = "site";
    process.env.TURNSTILE_SECRET_KEY = "secret";

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ success: true, action: "sign-up" }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      )
    );

    const result = await verifyTurnstileToken({ token: "good" });
    expect(result.ok).toBe(true);
  });

  it("rejects when Cloudflare reports failure", async () => {
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = "site";
    process.env.TURNSTILE_SECRET_KEY = "secret";

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({ success: false, "error-codes": ["invalid-input-response"] }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
    );

    const result = await verifyTurnstileToken({ token: "bad" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("invalid-input-response");
    }
  });
});
