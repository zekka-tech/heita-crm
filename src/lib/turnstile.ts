import { logger } from "@/lib/logger";

const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export function turnstileConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY && process.env.TURNSTILE_SECRET_KEY
  );
}

export function turnstileSiteKey(): string | null {
  return process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? null;
}

export type TurnstileVerifyInput = {
  token: string | null | undefined;
  remoteIp?: string | null;
  action?: string;
};

export type TurnstileVerifyResult =
  | { ok: true; action?: string; hostname?: string }
  | { ok: false; reason: string };

/**
 * Verify a Cloudflare Turnstile token server-side. When TURNSTILE_SECRET_KEY
 * is unset (development and CI) the verification is bypassed so the rest of
 * the system continues to work without provisioning Turnstile.
 */
export async function verifyTurnstileToken(
  input: TurnstileVerifyInput
): Promise<TurnstileVerifyResult> {
  if (!turnstileConfigured()) {
    if (process.env.NODE_ENV === "production") {
      logger.warn("turnstile.not_configured_in_production — bot protection disabled");
    }
    return { ok: true, action: "bypass-dev" };
  }

  if (!input.token) {
    return { ok: false, reason: "missing-token" };
  }

  const form = new URLSearchParams();
  form.set("secret", process.env.TURNSTILE_SECRET_KEY ?? "");
  form.set("response", input.token);
  if (input.remoteIp) form.set("remoteip", input.remoteIp);

  let response: Response;
  try {
    response = await fetch(TURNSTILE_VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
      signal: AbortSignal.timeout(5_000)
    });
  } catch (error) {
    logger.warn({ err: error }, "turnstile.network_error");
    return { ok: false, reason: "network-error" };
  }

  if (!response.ok) {
    return { ok: false, reason: `http-${response.status}` };
  }

  const data = (await response.json().catch(() => null)) as
    | {
        success?: boolean;
        action?: string;
        hostname?: string;
        ["error-codes"]?: string[];
      }
    | null;

  if (!data?.success) {
    return {
      ok: false,
      reason: data?.["error-codes"]?.join(",") ?? "rejected"
    };
  }

  return { ok: true, action: data.action, hostname: data.hostname };
}
