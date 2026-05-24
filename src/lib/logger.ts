import pino from "pino";

import { env } from "@/lib/env";

const isDev = env.NODE_ENV !== "production";

export const logger = pino({
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
      "*.refresh_token"
    ],
    censor: "[redacted]"
  },
  base: {
    service: "heita-crm",
    env: env.NODE_ENV
  }
});

export type Logger = typeof logger;
