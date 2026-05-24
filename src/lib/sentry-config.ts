// Sentry-config: kept independent of `@sentry/nextjs` so the project builds
// whether or not the SDK is installed. The runtime initialiser files import
// the SDK directly when present.

type RedactableValue = unknown;

/**
 * Mirror of pino's redact paths so anything in Sentry context, breadcrumbs,
 * or request snapshots gets scrubbed before leaving the process.
 */
const REDACT_KEYS = [
  "authorization",
  "cookie",
  "password",
  "passwordhash",
  "code",
  "codehash",
  "token",
  "access_token",
  "refresh_token",
  "secret",
  "x-hub-signature-256",
  "x-at-shared-secret"
];

const REDACTED = "[redacted]";

function redactStringDeep<T extends RedactableValue>(value: T): T {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) {
    return value.map((item) => redactStringDeep(item)) as unknown as T;
  }
  if (typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (REDACT_KEYS.includes(key.toLowerCase())) {
        result[key] = REDACTED;
      } else {
        result[key] = redactStringDeep(val);
      }
    }
    return result as unknown as T;
  }
  return value;
}

export type SentryRedactableEvent = {
  request?: {
    headers?: Record<string, unknown> | null;
    cookies?: Record<string, unknown> | null;
  };
  user?:
    | { id?: string | number | null | undefined; [key: string]: unknown }
    | null;
  extra?: Record<string, unknown>;
  contexts?: Record<string, unknown>;
};

export function buildSentryBeforeSend<E extends SentryRedactableEvent>(): (
  event: E,
  hint?: unknown
) => E {
  return (event) => {
    if (event.request?.headers) {
      event.request.headers = redactStringDeep(event.request.headers);
    }
    if (event.request?.cookies) {
      event.request.cookies = redactStringDeep(event.request.cookies);
    }
    if (event.user) {
      // Never ship raw email or phone — only the internal id.
      event.user = { id: event.user.id ?? null };
    }
    if (event.extra) {
      event.extra = redactStringDeep(event.extra);
    }
    if (event.contexts) {
      event.contexts = redactStringDeep(event.contexts);
    }
    return event;
  };
}

export const SENTRY_COMMON = {
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment:
    process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? "development",
  release: process.env.NEXT_PUBLIC_APP_VERSION ?? undefined,
  enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
  tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? "0.1"),
  attachStacktrace: true,
  sendDefaultPii: false
} as const;

export function sentryConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN);
}
