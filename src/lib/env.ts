import { z } from "zod";

const NODE_ENV_VALUES = ["development", "test", "production"] as const;

for (const path of [".env.local", ".env"]) {
  try {
    process.loadEnvFile?.(path);
  } catch {
    // Ignore missing files; the schema below decides whether the current
    // environment is sufficiently configured for the active runtime.
  }
}

const envSchema = z
  .object({
    NODE_ENV: z.enum(NODE_ENV_VALUES).default("development"),
    DATABASE_URL: z.string().min(1),
    DB_CONNECTION_LIMIT: z.coerce.number().int().min(1).max(100).default(10),
    DEPLOYMENT_READ_ONLY: z.enum(["0", "1"]).default("0"),
    AUTH_SECRET: z.string().optional(),
    POS_SHARED_SECRET: z.string().optional(),
    WHATSAPP_APP_SECRET: z.string().optional(),
    WHATSAPP_ACCESS_TOKEN: z.string().optional(),
    WHATSAPP_VERIFY_TOKEN: z.string().optional(),
    ANTHROPIC_API_KEY: z.string().optional(),
    OLLAMA_BASE_URL: z.string().optional(),
    CIRCUIT_BREAKER_FAILURE_THRESHOLD: z.coerce.number().int().min(1).max(20).default(5),
    CIRCUIT_BREAKER_COOLDOWN_MS: z.coerce.number().int().min(1000).max(300_000).default(60_000)
  })
  .superRefine((data, ctx) => {
    const isProduction = data.NODE_ENV === "production";

    if (isProduction && !data.AUTH_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "AUTH_SECRET is required in production.",
        path: ["AUTH_SECRET"]
      });
    }

    if (isProduction && !data.POS_SHARED_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "POS_SHARED_SECRET is required in production.",
        path: ["POS_SHARED_SECRET"]
      });
    }

    const whatsappConfigured = Boolean(
      data.WHATSAPP_ACCESS_TOKEN || data.WHATSAPP_VERIFY_TOKEN
    );

    if (isProduction && whatsappConfigured && !data.WHATSAPP_APP_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "WHATSAPP_APP_SECRET is required when WhatsApp webhooks are enabled in production.",
        path: ["WHATSAPP_APP_SECRET"]
      });
    }

    const hasAiProvider = Boolean(data.ANTHROPIC_API_KEY || data.OLLAMA_BASE_URL);
    if (isProduction && !hasAiProvider) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Configure ANTHROPIC_API_KEY or OLLAMA_BASE_URL in production so AI chat has a provider.",
        path: ["ANTHROPIC_API_KEY"]
      });
    }
  });

const parsedEnv = {
  ...process.env,
  DATABASE_URL:
    process.env.DATABASE_URL ??
    (process.env.NODE_ENV === "test"
      ? "postgresql://heita:heita_test@localhost:5432/heita_test"
      : undefined)
};

export const env = envSchema.parse(parsedEnv);

export function deploymentReadOnlyEnabled() {
  return env.DEPLOYMENT_READ_ONLY === "1";
}

export function withDatabaseConnectionLimit(connectionString: string) {
  const url = new URL(connectionString);

  if (!url.searchParams.has("connection_limit")) {
    url.searchParams.set("connection_limit", String(env.DB_CONNECTION_LIMIT));
  }

  return url.toString();
}
