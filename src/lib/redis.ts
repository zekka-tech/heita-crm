import Redis, { type RedisOptions } from "ioredis";

declare global {
  var __heitaRedis__: Redis | undefined;
  var __heitaRedisQueue__: Redis | undefined;
}

export function getRedis() {
  if (!process.env.REDIS_URL) {
    return null;
  }

  if (!global.__heitaRedis__) {
    global.__heitaRedis__ = new Redis(process.env.REDIS_URL, {
      lazyConnect: true,
      connectTimeout: 1000,
      commandTimeout: 1000,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false
    });
    global.__heitaRedis__.on("error", () => {
      // Redis is optional for local OTP caching; DB verification remains the fallback.
    });
  }

  return global.__heitaRedis__;
}

/**
 * BullMQ requires `maxRetriesPerRequest: null` and `enableReadyCheck: false` on
 * any ioredis connection it owns, otherwise blocking commands (BLPOP, BRPOPLPUSH)
 * will throw `MaxRetriesPerRequestError`. The fast-fail config used by the rest
 * of the app is unsafe for queue workers, so we maintain a dedicated long-lived
 * connection for BullMQ here.
 */
export function getQueueRedis() {
  if (!process.env.REDIS_URL) {
    return null;
  }

  if (!global.__heitaRedisQueue__) {
    const options: RedisOptions = {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      lazyConnect: false
    };

    global.__heitaRedisQueue__ = new Redis(process.env.REDIS_URL, options);
    global.__heitaRedisQueue__.on("error", (error) => {
      // Surface but don't crash the process — BullMQ will reconnect.
      if (process.env.NODE_ENV !== "test") {
        console.error("queue.redis.error", error.message);
      }
    });
  }

  return global.__heitaRedisQueue__;
}
