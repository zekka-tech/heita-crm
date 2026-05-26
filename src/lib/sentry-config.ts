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
    status?: number;
  };
  user?:
    | { id?: string | number | null | undefined; [key: string]: unknown }
    | null;
  extra?: Record<string, unknown>;
  contexts?: Record<string, unknown>;
  tags?: Record<string, string | number | boolean | bigint | null | undefined>;
};

export function buildSentryBeforeSend<E extends SentryRedactableEvent>(): (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  event: any,
  hint?: unknown
) => E | null {
  return (event: E) => {
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

    // Filter 4xx client errors to reduce Sentry quota usage.
    // Only capture if the event has been explicitly flagged with capture_4xx=true.
    const statusCode = event.request?.status;
    if (statusCode !== undefined && statusCode >= 400 && statusCode < 500) {
      if (!event.tags?.capture_4xx) return null;
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
  sendDefaultPii: false,
  ignoreErrors: [
    "fetch failed",
    "ECONNREFUSED",
    "ECONNRESET",
    "ETIMEDOUT",
    "socket hang up",
    "AbortError",
    "The operation was aborted",
    /^timeout$/i,
    "Load failed",
    "NetworkError",
    "Failed to fetch"
  ]
};

export function sentryConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN);
}
