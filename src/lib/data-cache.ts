/**
 * Short-lived Redis cache for expensive, frequently-read aggregates.
 * All TTLs are intentionally short — staleness is acceptable for analytics
 * and public business profiles, but freshness matters for loyalty balances.
 *
 * Falls back to the live fetch when Redis is unavailable (same as rate-limit
 * fail-open pattern used elsewhere in this codebase).
 */
import { getRedis } from "@/lib/redis";

const ANALYTICS_TTL_S = 5 * 60; // 5 minutes
const BUSINESS_PROFILE_TTL_S = 10 * 60; // 10 minutes

// All possible analytics window sizes — used for bulk cache invalidation on writes.
const ANALYTICS_WEEK_OPTIONS = [4, 8, 12, 26] as const;

async function cacheGet<T>(key: string): Promise<T | null> {
  const redis = getRedis();
  if (!redis) return null;
  try {
    const raw = await redis.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

async function cacheSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.setex(key, ttlSeconds, JSON.stringify(value));
  } catch {
    // non-fatal
  }
}

export async function cacheDel(...keys: string[]): Promise<void> {
  const redis = getRedis();
  if (!redis || keys.length === 0) return;
  try {
    await redis.del(...keys);
  } catch {
    // non-fatal
  }
}

export function analyticsKey(businessId: string, weeks: number): string {
  return `analytics:dashboard:${businessId}:${weeks}w`;
}

/** Invalidate every week-window variant for a business (call on loyalty/membership writes). */
export function analyticsKeysForBusiness(businessId: string): string[] {
  return ANALYTICS_WEEK_OPTIONS.map((w) => analyticsKey(businessId, w));
}

export function businessProfileKey(businessId: string): string {
  return `business:profile:${businessId}`;
}

export async function withAnalyticsCache<T>(
  businessId: string,
  weeks: number,
  fetch: () => Promise<T>
): Promise<T> {
  const key = analyticsKey(businessId, weeks);
  const cached = await cacheGet<T>(key);
  if (cached !== null) return cached;
  const value = await fetch();
  await cacheSet(key, value, ANALYTICS_TTL_S);
  return value;
}

export async function withBusinessProfileCache<T>(
  businessId: string,
  fetch: () => Promise<T>
): Promise<T> {
  const key = businessProfileKey(businessId);
  const cached = await cacheGet<T>(key);
  if (cached !== null) return cached;
  const value = await fetch();
  await cacheSet(key, value, BUSINESS_PROFILE_TTL_S);
  return value;
}
