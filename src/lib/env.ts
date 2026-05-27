import { z } from "zod";

const NODE_ENV_VALUES = ["development", "test", "production"] as const;

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
    DEEPSEEK_API_KEY: z.string().optional(),
    OLLAMA_BASE_URL: z.string().optional(),
    CIRCUIT_BREAKER_FAILURE_THRESHOLD: z.coerce.number().int().min(1).max(20).default(5),
    CIRCUIT_BREAKER_COOLDOWN_MS: z.coerce.number().int().min(1000).max(300_000).default(60_000),
    METRICS_BEARER_TOKEN: z.string().optional(),
    CRON_SECRET: z.string().min(32).optional(),
    AWS_ACCESS_KEY_ID: z.string().optional(),
    AWS_SECRET_ACCESS_KEY: z.string().optional(),
    VAPID_PRIVATE_KEY: z.string().optional(),
    VAPID_SUBJECT: z.string().optional()
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
