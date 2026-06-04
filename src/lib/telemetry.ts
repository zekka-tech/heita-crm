import { createHash } from "node:crypto";

/**
 * Lightweight server-side PostHog capture.
 *
 * Uses the REST API directly (no posthog-node dep) so the module stays
 * edge-compatible. Every call is fire-and-forget — telemetry must never
 * block a user-facing response.
 *
 * Distinct-ID: sha256(userId).slice(0,32) — no raw PII leaves the server.
 * Property stripping: phone, email, token, otp, secret redacted.
 */

const POSTHOG_CAPTURE_URL = `${
  process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://app.posthog.com"
}/capture/`;

const REDACTED_KEYS = new Set([
  "phone",
  "email",
  "token",
  "otp",
  "secret",
  "password",
  "auth",
  "key",
  "apiKey",
]);

function stripPii(props: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(props)) {
    out[k] = REDACTED_KEYS.has(k.toLowerCase()) ? "[redacted]" : v;
  }
  return out;
}

/** Stable anonymous distinct ID derived from a user ID — no raw PII. */
export function distinctId(userId: string): string {
  return `u:${createHash("sha256").update(userId).digest("hex").slice(0, 32)}`;
}

type CaptureInput = {
  userId: string;
  event: string;
  properties?: Record<string, unknown>;
};

/**
 * Fire-and-forget server-side event capture.
 * Safe to call from server actions and API routes — never throws.
 */
export function captureEvent(input: CaptureInput): void {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return;

  const body = JSON.stringify({
    api_key: key,
    event: input.event,
    distinct_id: distinctId(input.userId),
    properties: stripPii(input.properties ?? {}),
    timestamp: new Date().toISOString(),
  });

  fetch(POSTHOG_CAPTURE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    // Next.js: opt this fetch out of the data cache so it never gets deduplicated
    cache: "no-store",
  }).catch(() => undefined);
}
