import { getRedis } from "@/lib/redis";

export type RateLimitDecision = {
  allowed: boolean;
  remaining: number;
  resetInSeconds: number;
};

type RateLimitOptions = {
  identifier: string;
  windowSeconds: number;
  max: number;
};

const memoryStore = new Map<string, { count: number; resetAt: number }>();

function decideFromMemory(opts: RateLimitOptions): RateLimitDecision {
  const now = Date.now();
  const key = `${opts.identifier}:${opts.windowSeconds}`;
  const entry = memoryStore.get(key);

  if (!entry || entry.resetAt <= now) {
    memoryStore.set(key, {
      count: 1,
      resetAt: now + opts.windowSeconds * 1000
    });
    return {
      allowed: true,
      remaining: opts.max - 1,
      resetInSeconds: opts.windowSeconds
    };
  }

  if (entry.count >= opts.max) {
    return {
      allowed: false,
      remaining: 0,
      resetInSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1000))
    };
  }

  entry.count += 1;
  return {
    allowed: true,
    remaining: opts.max - entry.count,
    resetInSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1000))
  };
}

export async function enforceRateLimit(
  opts: RateLimitOptions
): Promise<RateLimitDecision> {
  const redis = getRedis();

  if (!redis) {
    return decideFromMemory(opts);
  }

  try {
    const key = `rl:${opts.identifier}:${opts.windowSeconds}`;
    const count = await redis.incr(key);

    if (count === 1) {
      await redis.expire(key, opts.windowSeconds);
    }

    const ttl = await redis.ttl(key);
    const resetInSeconds = ttl > 0 ? ttl : opts.windowSeconds;

    if (count > opts.max) {
      return { allowed: false, remaining: 0, resetInSeconds };
    }

    return {
      allowed: true,
      remaining: Math.max(0, opts.max - count),
      resetInSeconds
    };
  } catch {
    return decideFromMemory(opts);
  }
}

export function rateLimitHeaders(decision: RateLimitDecision): HeadersInit {
  return {
    "X-RateLimit-Remaining": String(decision.remaining),
    "X-RateLimit-Reset": String(decision.resetInSeconds)
  };
}
