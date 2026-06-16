import { prisma, withBusinessScope } from "@/lib/prisma";
import { getRedis } from "@/lib/redis";

export const FEATURE_FLAGS = {
  nativeComms: {
    key: "nativeComms",
    label: "Native communications",
    description: "Enable the first-party in-app communication stack.",
    defaultEnabled: false
  },
  nativeStatusFeed: {
    key: "nativeStatusFeed",
    label: "Native status feed",
    description: "Enable 24-hour business status posts and stories.",
    defaultEnabled: false
  },
  localityDiscovery: {
    key: "localityDiscovery",
    label: "Locality discovery",
    description: "Enable area and nearby-business discovery surfaces.",
    defaultEnabled: false
  },
  whatsappPrimary: {
    key: "whatsappPrimary",
    label: "WhatsApp primary channel",
    description: "Keep WhatsApp as a preferred outbound channel when available.",
    defaultEnabled: true
  },
  reachPackEnforcement: {
    key: "reachPackEnforcement",
    label: "Reach-pack quota enforcement",
    description: "Block proactive broadcasts once the effective outbound-message allowance (plan + reach-packs) is reached.",
    defaultEnabled: false
  }
} as const;

export type FeatureFlagKey = keyof typeof FEATURE_FLAGS;
export type FeatureFlagContext = { businessId?: string | null };

const FEATURE_FLAG_KEYS = new Set<string>(Object.keys(FEATURE_FLAGS));
const CACHE_TTL_SECONDS = 60;

export function isKnownFeatureFlagKey(key: string): key is FeatureFlagKey {
  return FEATURE_FLAG_KEYS.has(key);
}

export function assertFeatureFlagKey(key: string): asserts key is FeatureFlagKey {
  if (!isKnownFeatureFlagKey(key)) {
    throw new Error(`Unknown feature flag: ${key}`);
  }
}

function cacheKey(key: FeatureFlagKey, businessId?: string | null) {
  return `feature-flag:${key}:${businessId ?? "global"}`;
}

function parseBoolean(value: string | undefined): boolean | null {
  if (value === undefined) return null;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return null;
}

function envFlagDefault(key: FeatureFlagKey): boolean | null {
  const envKey = `FEATURE_FLAG_${key.replace(/[A-Z]/g, (letter) => `_${letter}`).toUpperCase()}`;
  const direct = parseBoolean(process.env[envKey]);
  if (direct !== null) return direct;

  const packed = process.env.HEITA_FEATURE_FLAGS;
  if (!packed) return null;
  for (const entry of packed.split(",")) {
    const [rawKey, rawValue] = entry.split("=");
    if (rawKey?.trim() === key) return parseBoolean(rawValue);
  }
  return null;
}

async function readCachedFlag(key: FeatureFlagKey, businessId?: string | null) {
  const redis = getRedis();
  if (!redis) return null;
  try {
    const cached = await redis.get(cacheKey(key, businessId));
    return cached === null ? null : cached === "1";
  } catch {
    return null;
  }
}

async function writeCachedFlag(key: FeatureFlagKey, enabled: boolean, businessId?: string | null) {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.setex(cacheKey(key, businessId), CACHE_TTL_SECONDS, enabled ? "1" : "0");
  } catch {
    // Redis is an optimization only; Postgres remains authoritative.
  }
}

export async function invalidateFeatureFlagCache(key: FeatureFlagKey, businessId?: string | null) {
  const redis = getRedis();
  if (!redis) return;
  try {
    if (businessId) {
      await redis.del(cacheKey(key, businessId));
    }
    await redis.del(cacheKey(key));
  } catch {
    // Cache invalidation failure must not block flag changes.
  }
}

export async function isFeatureEnabled(key: FeatureFlagKey, context: FeatureFlagContext = {}) {
  assertFeatureFlagKey(key);

  const cached = await readCachedFlag(key, context.businessId);
  if (cached !== null) return cached;

  if (context.businessId) {
    const override = await withBusinessScope(context.businessId, (tx) => {
      return tx.featureFlagOverride.findUnique({
        where: { businessId_key: { businessId: context.businessId!, key } },
        select: { isEnabled: true }
      });
    });
    if (override) {
      await writeCachedFlag(key, override.isEnabled, context.businessId);
      return override.isEnabled;
    }
  }

  const envDefault = envFlagDefault(key);
  if (envDefault !== null) {
    await writeCachedFlag(key, envDefault, context.businessId);
    return envDefault;
  }

  const row = await prisma.featureFlag.findUnique({
    where: { key },
    select: { defaultEnabled: true }
  });
  const enabled = row?.defaultEnabled ?? FEATURE_FLAGS[key].defaultEnabled;
  await writeCachedFlag(key, enabled, context.businessId);
  return enabled;
}
