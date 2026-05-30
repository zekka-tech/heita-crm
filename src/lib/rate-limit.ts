import { logger } from "@/lib/logger";
import { incrementRedisError } from "@/lib/metrics";
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
  /** When true, a Redis error in production returns denied rather than falling back to memory. */
  failClosed?: boolean;
};

const memoryStore = new Map<string, { count: number; resetAt: number }>();

// Evict stale entries every 10 minutes to prevent unbounded memory growth
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of memoryStore) {
    if (entry.resetAt <= now) memoryStore.delete(key);
  }
}, 10 * 60 * 1000).unref();

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
    logger.warn(
      { identifier: opts.identifier },
      "rate_limit.redis_unavailable_using_memory_fallback"
    );
    return decideFromMemory(opts);
  }

  try {
    const key = `rl:${opts.identifier}:${opts.windowSeconds}`;

    // Atomic INCR + conditional EXPIRE using a Lua script to avoid the
    // race where a crash between INCR and EXPIRE leaves a key with no TTL.
    const result = await redis.eval(
      `local c = redis.call('INCR', KEYS[1])
       if c == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
       local ttl = redis.call('TTL', KEYS[1])
       return {c, ttl}`,
      1,
      key,
      String(opts.windowSeconds)
    ) as [number, number];

    const count = result[0];
    const ttl = result[1];
    const resetInSeconds = ttl > 0 ? ttl : opts.windowSeconds;

    if (count > opts.max) {
      return { allowed: false, remaining: 0, resetInSeconds };
    }

    return {
      allowed: true,
      remaining: Math.max(0, opts.max - count),
      resetInSeconds
    };
  } catch (err) {
    incrementRedisError();
    if (opts.failClosed) {
      logger.error(
        { identifier: opts.identifier, err },
        "rate_limit.redis_error_fail_closed"
      );
      return { allowed: false, remaining: 0, resetInSeconds: 60 };
    }
    logger.warn(
      { identifier: opts.identifier, err },
      "rate_limit.redis_error_using_memory_fallback"
    );
    return decideFromMemory(opts);
  }
}

export function rateLimitHeaders(decision: RateLimitDecision): HeadersInit {
  return {
    "X-RateLimit-Remaining": String(decision.remaining),
    "X-RateLimit-Reset": String(decision.resetInSeconds)
  };
}
