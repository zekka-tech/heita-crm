import { z } from "zod";

const NODE_ENV_VALUES = ["development", "test", "production"] as const;

const envSchema = z
  .object({
    NODE_ENV: z.enum(NODE_ENV_VALUES).default("development"),
    DATABASE_URL: z.string().min(1),
    DB_CONNECTION_LIMIT: z.coerce.number().int().min(1).max(100).default(10),
    DEPLOYMENT_READ_ONLY: z.enum(["0", "1"]).default("0"),

    // Auth
    AUTH_SECRET: z.string().optional(),
    NEXTAUTH_URL: z.string().url().optional(),
    AUTH_GOOGLE_ID: z.string().optional(),
    AUTH_GOOGLE_SECRET: z.string().optional(),
    AUTH_APPLE_ID: z.string().optional(),
    AUTH_APPLE_SECRET: z.string().optional(),
    STAFF_INVITE_SECRET: z.string().optional(),

    // POS
    POS_SHARED_SECRET: z.string().optional(),
    POS_RATE_LIMIT_PER_BUSINESS_PER_MINUTE: z.coerce.number().int().min(1).optional(),
    POS_RATE_LIMIT_PER_BUSINESS_IP_PER_MINUTE: z.coerce.number().int().min(1).optional(),

    // WhatsApp / Meta
    WHATSAPP_APP_SECRET: z.string().optional(),
    WHATSAPP_ACCESS_TOKEN: z.string().optional(),
    WHATSAPP_VERIFY_TOKEN: z.string().optional(),
    WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
    WHATSAPP_BUSINESS_ACCOUNT_ID: z.string().optional(),
    WHATSAPP_API_VERSION: z.string().optional(),

    // AI providers
    ANTHROPIC_API_KEY: z.string().optional(),
    ANTHROPIC_MODEL: z.string().optional(),
    DEEPSEEK_API_KEY: z.string().optional(),
    OLLAMA_BASE_URL: z.string().optional(),
    OLLAMA_CHAT_MODEL: z.string().optional(),
    OLLAMA_EMBED_MODEL: z.string().optional(),
    OLLAMA_RERANK_MODEL: z.string().optional(),

    // Circuit breaker
    CIRCUIT_BREAKER_FAILURE_THRESHOLD: z.coerce.number().int().min(1).max(20).default(5),
    CIRCUIT_BREAKER_COOLDOWN_MS: z.coerce.number().int().min(1000).max(300_000).default(60_000),

    // Observability
    METRICS_BEARER_TOKEN: z.string().optional(),
    OTLP_ENDPOINT: z.string().url().optional(),
    LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).default("info"),
    SENTRY_ENVIRONMENT: z.string().optional(),
    SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).optional(),

    // Scheduled jobs
    CRON_SECRET: z.string().min(32).optional(),

    // Storage (S3-compatible: Cloudflare R2 in prod, MinIO locally)
    AWS_ACCESS_KEY_ID: z.string().optional(),
    AWS_SECRET_ACCESS_KEY: z.string().optional(),
    AWS_REGION: z.string().optional(),
    AWS_S3_ENDPOINT: z.string().optional(),
    AWS_S3_BUCKET: z.string().optional(),
    R2_PUBLIC_URL: z.string().url().optional(),
    MINIO_ENDPOINT: z.string().optional(),
    MINIO_ACCESS_KEY: z.string().optional(),
    MINIO_SECRET_KEY: z.string().optional(),
    MINIO_BUCKET: z.string().optional(),

    // Push notifications
    VAPID_PRIVATE_KEY: z.string().optional(),
    VAPID_PUBLIC_KEY: z.string().optional(),
    VAPID_SUBJECT: z.string().optional(),

    // Malware scanning
    MALWARE_SCAN_MODE: z.enum(["none", "clamav"]).optional(),
    MALWARE_SCAN_REQUIRED: z.enum(["0", "1"]).optional(),
    CLAMAV_HOST: z.string().optional(),
    CLAMAV_PORT: z.coerce.number().int().optional(),
    CLAMAV_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120_000).optional(),

    // Redis
    REDIS_URL: z.string().optional(),
    REDIS_PORT: z.coerce.number().int().optional(),

    // Email (Resend)
    EMAIL_FROM: z.string().optional(),
    EMAIL_SERVER_PASSWORD: z.string().optional(),

    // Africa's Talking (SMS + webhooks)
    AT_API_KEY: z.string().optional(),
    AT_USERNAME: z.string().optional(),
    AT_SENDER_ID: z.string().optional(),
    AT_ALLOWLIST_IPS: z.string().optional(),
    AT_WEBHOOK_SECRET: z.string().optional(),

    // Pusher (real-time)
    PUSHER_APP_ID: z.string().optional(),
    PUSHER_KEY: z.string().optional(),
    PUSHER_SECRET: z.string().optional(),
    PUSHER_CLUSTER: z.string().optional(),

    // Yoco (payments)
    YOCO_SECRET_KEY: z.string().optional(),
    YOCO_WEBHOOK_SECRET: z.string().optional(),

    // Staff step-up MFA
    STAFF_STEP_UP_WINDOW_SECONDS: z.coerce.number().int().optional(),

    // Customer import (inline vs queued)
    CUSTOMER_IMPORT_INLINE: z.enum(["0", "1"]).optional(),
    AI_INGEST_INLINE: z.enum(["0", "1"]).optional(),

    // Process / runtime ops
    SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60_000).optional(),
    TRUSTED_PROXY_IPS: z.string().optional(),

    // Bot protection
    TURNSTILE_SECRET_KEY: z.string().optional(),
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: z.string().optional(),
    E2E_EXPOSE_DEV_OTP: z.enum(["0", "1"]).optional(),

    // Public app config
    NEXT_PUBLIC_APP_URL: z.string().url().optional(),
    NEXT_PUBLIC_APP_VERSION: z.string().optional(),
    NEXT_PUBLIC_SENTRY_DSN: z.string().optional(),
    NEXT_PUBLIC_PUSHER_KEY: z.string().optional(),
    NEXT_PUBLIC_PUSHER_CLUSTER: z.string().optional(),
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: z.string().optional(),
    NEXT_PUBLIC_WHATSAPP_NUMBER: z.string().optional(),

    // Sentry (build-time source map upload)
    SENTRY_ORG: z.string().optional(),
    SENTRY_PROJECT: z.string().optional(),
    SENTRY_AUTH_TOKEN: z.string().optional()
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

    if (isProduction && data.AT_API_KEY && !data.AT_WEBHOOK_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "AT_WEBHOOK_SECRET is required in production when AT_API_KEY is set — it authenticates Africa's Talking delivery callbacks.",
        path: ["AT_WEBHOOK_SECRET"]
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

    if (isProduction && !data.METRICS_BEARER_TOKEN) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "METRICS_BEARER_TOKEN is required in production to protect the /api/metrics endpoint.",
        path: ["METRICS_BEARER_TOKEN"]
      });
    }

    if (isProduction && !data.CRON_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "CRON_SECRET is required in production to authenticate scheduled job requests.",
        path: ["CRON_SECRET"]
      });
    }

    if (isProduction && !data.TURNSTILE_SECRET_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "TURNSTILE_SECRET_KEY is required in production to enforce bot protection on OTP endpoints.",
        path: ["TURNSTILE_SECRET_KEY"]
      });
    }

    const hasObjectStorage = Boolean(data.AWS_ACCESS_KEY_ID || data.AWS_SECRET_ACCESS_KEY);
    if (isProduction && data.AWS_ACCESS_KEY_ID && !data.AWS_SECRET_ACCESS_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "AWS_SECRET_ACCESS_KEY is required when AWS_ACCESS_KEY_ID is set.",
        path: ["AWS_SECRET_ACCESS_KEY"]
      });
    }
    if (isProduction && !data.AWS_ACCESS_KEY_ID && data.AWS_SECRET_ACCESS_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "AWS_ACCESS_KEY_ID is required when AWS_SECRET_ACCESS_KEY is set.",
        path: ["AWS_ACCESS_KEY_ID"]
      });
    }

    // Yoco billing keys travel together: the checkout API needs the secret
    // key and the webhook needs the signing secret to verify callbacks. A
    // half-configured pair only surfaces when a real payment/webhook arrives,
    // so enforce both-or-neither in production to fail fast at boot instead.
    const yocoConfigured = Boolean(data.YOCO_SECRET_KEY || data.YOCO_WEBHOOK_SECRET);
    if (isProduction && yocoConfigured && !data.YOCO_SECRET_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "YOCO_SECRET_KEY is required when Yoco billing is enabled in production — it authenticates checkout-session creation.",
        path: ["YOCO_SECRET_KEY"]
      });
    }
    if (isProduction && yocoConfigured && !data.YOCO_WEBHOOK_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "YOCO_WEBHOOK_SECRET is required when Yoco billing is enabled in production — it verifies payment webhook signatures.",
        path: ["YOCO_WEBHOOK_SECRET"]
      });
    }

    if (data.VAPID_PRIVATE_KEY && !data.VAPID_SUBJECT) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "VAPID_SUBJECT (mailto: or https: contact) is required when VAPID_PRIVATE_KEY is set.",
        path: ["VAPID_SUBJECT"]
      });
    }

    void hasObjectStorage;
  });

type ParsedEnv = z.infer<typeof envSchema>;

const BUILD_PHASE_VALUES = ["phase-production-build", "phase-export"] as const;

function isBuildPhase() {
  return (
    process.env.HEITA_BUILD_PHASE === "1" ||
    BUILD_PHASE_VALUES.includes(process.env.NEXT_PHASE as (typeof BUILD_PHASE_VALUES)[number]) ||
    process.env.npm_lifecycle_event === "build"
  );
}

function buildPhaseDefaults(): ParsedEnv {
  // Permissive defaults used only while Next.js collects page data. The
  // runtime path always re-parses against the live environment, so missing
  // production secrets still surface on the first real request.
  return envSchema.parse({
    NODE_ENV: "development",
    DATABASE_URL:
      process.env.DATABASE_URL ?? "postgresql://build:build@localhost:5432/build"
  });
}

let cachedEnv: ParsedEnv | null = null;

function parseEnv(): ParsedEnv {
  // Never cache while next build is collecting page data — `next build` sets
  // NODE_ENV=production but the deployment may not have provisioned secrets
  // yet, so falling through to envSchema.parse() would fail the production
  // superRefine checks. Always synthesise safe defaults during the build
  // phase and re-validate at runtime on the first real request.
  if (isBuildPhase()) {
    return buildPhaseDefaults();
  }

  if (cachedEnv) return cachedEnv;

  const candidate = {
    ...process.env,
    DATABASE_URL:
      process.env.DATABASE_URL ??
      (process.env.NODE_ENV === "test"
        ? "postgresql://heita:heita_test@localhost:5432/heita_test"
        : undefined)
  };

  cachedEnv = envSchema.parse(candidate);
  return cachedEnv;
}

/**
 * Lazy env proxy. The first property access triggers schema validation; until
 * then the module is safe to import during Next.js build-time page-data
 * collection or any other code path that may run without a live environment.
 */
export const env = new Proxy({} as ParsedEnv, {
  get(_target, prop) {
    const parsed = parseEnv();
    return parsed[prop as keyof ParsedEnv];
  },
  has(_target, prop) {
    const parsed = parseEnv();
    return prop in parsed;
  },
  ownKeys() {
    return Reflect.ownKeys(parseEnv());
  },
  getOwnPropertyDescriptor(_target, prop) {
    const parsed = parseEnv();
    if (!(prop in parsed)) return undefined;
    return {
      enumerable: true,
      configurable: true,
      writable: false,
      value: parsed[prop as keyof ParsedEnv]
    };
  }
});

/**
 * For tests and operational scripts that want to reset the cached parse —
 * mostly relevant when the test suite mutates process.env.
 */
export function resetEnvForTests() {
  cachedEnv = null;
}

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
