import pino from "pino";

const isDev = process.env.NODE_ENV !== "production";

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
    env: process.env.NODE_ENV ?? "development"
  }
});

export type Logger = typeof logger;
