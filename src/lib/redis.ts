import Redis from "ioredis";

declare global {
  var __heitaRedis__: Redis | undefined;
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
