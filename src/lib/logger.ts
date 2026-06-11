import { AsyncLocalStorage } from "async_hooks";

import pino from "pino";

import { env } from "@/lib/env";
import { currentTraceId } from "@/lib/tracing";

const isDev = env.NODE_ENV !== "production";

type RequestContext = { requestId?: string; userId?: string };
export const requestContext = new AsyncLocalStorage<RequestContext>();

export function getRequestId(): string | undefined {
  return requestContext.getStore()?.requestId;
}

const _logger = pino({
  level: process.env.LOG_LEVEL ?? (isDev ? "debug" : "info"),
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "*.password",
      "*.passwordHash",
      "*.code",
      "*.codeHash",
      "*.token",
      "*.access_token",
      "*.refresh_token",
      "*.phone",
      "*.email",
      "*.to",
      "*.contactPhone",
      "*.phoneNumber",
      "*.imageUrl",
      "*.url",
      "*.body",
      "*.acceptUrl",
      "*.metadata.contactPhone",
      "req.headers.x-yoco-signature",
      "req.headers.stripe-signature",
      "*.signature",
      "req.headers.x-heita-signature",
      "req.headers.x-cron-secret",
      "*.apiKey",
      "*.encryptedApiKey"
    ],
    censor: "[redacted]"
  },
  base: {
    service: "heita-crm",
    env: env.NODE_ENV
  }
});

const logMethods = ["info", "warn", "error", "debug", "fatal", "trace"] as const;
type LogMethod = (typeof logMethods)[number];

export const logger = new Proxy(_logger, {
  get(target, prop) {
    if (logMethods.includes(prop as LogMethod)) {
      return (...args: Parameters<typeof target.info>) => {
        const ctx = requestContext.getStore();
        const traceId = currentTraceId();
        if (
          (ctx?.requestId || traceId) &&
          args.length > 0 &&
          typeof args[0] === "object" &&
          args[0] !== null
        ) {
          args[0] = {
            ...(args[0] as Record<string, unknown>),
            ...(ctx?.requestId ? { requestId: ctx.requestId } : {}),
            ...(traceId ? { traceId } : {})
          };
        }
        return (target[prop as LogMethod] as (...a: unknown[]) => void).apply(target, args);
      };
    }
    return (target as unknown as Record<string | symbol, unknown>)[prop];
  }
});

export type Logger = typeof logger;
