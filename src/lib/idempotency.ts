import { getRedis } from "@/lib/redis";

const DEFAULT_TTL_SECONDS = 24 * 60 * 60;
const DEFAULT_LOCK_SECONDS = 60;

type IdempotencyEntry = {
  expiresAt: number;
  state: "processing" | "completed";
};

const memoryStore = new Map<string, IdempotencyEntry>();

function getScopedKey(scope: string, key: string): string {
  return `idem:${scope}:${key}`;
}

function getMemoryEntry(cacheKey: string): IdempotencyEntry | null {
  const entry = memoryStore.get(cacheKey);

  if (!entry) {
    return null;
  }

  if (entry.expiresAt <= Date.now()) {
    memoryStore.delete(cacheKey);
    return null;
  }

  return entry;
}

async function runMemoryIdempotentOperation<T>(input: {
  cacheKey: string;
  ttlSeconds: number;
  lockSeconds: number;
  execute: () => Promise<T>;
  replay: () => Promise<T>;
}) {
  const existing = getMemoryEntry(input.cacheKey);
  if (existing?.state === "completed") {
    return input.replay();
  }

  if (existing?.state === "processing") {
    throw new Error("This action is already being processed. Please try again shortly.");
  }

  memoryStore.set(input.cacheKey, {
    state: "processing",
    expiresAt: Date.now() + input.lockSeconds * 1000
  });

  try {
    const result = await input.execute();
    memoryStore.set(input.cacheKey, {
      state: "completed",
      expiresAt: Date.now() + input.ttlSeconds * 1000
    });
    return result;
  } catch (error) {
    memoryStore.delete(input.cacheKey);
    throw error;
  }
}

export async function runIdempotentOperation<T>(input: {
  scope: string;
  key: string;
  ttlSeconds?: number;
  lockSeconds?: number;
  execute: () => Promise<T>;
  replay: () => Promise<T>;
}): Promise<T> {
  const key = input.key.trim();
  if (!key) {
    throw new Error("An idempotency key is required for this action.");
  }

  const ttlSeconds = input.ttlSeconds ?? DEFAULT_TTL_SECONDS;
  const lockSeconds = input.lockSeconds ?? DEFAULT_LOCK_SECONDS;
  const cacheKey = getScopedKey(input.scope, key);
  const redis = getRedis();

  if (!redis) {
    return runMemoryIdempotentOperation({
      cacheKey,
      ttlSeconds,
      lockSeconds,
      execute: input.execute,
      replay: input.replay
    });
  }

  const completedKey = `${cacheKey}:done`;
  const lockKey = `${cacheKey}:lock`;

  try {
    const completed = await redis.get(completedKey);
    if (completed) {
      return input.replay();
    }

    const lock = await redis.set(lockKey, "1", "EX", lockSeconds, "NX");
    if (!lock) {
      const replayable = await redis.get(completedKey);
      if (replayable) {
        return input.replay();
      }

      throw new Error("This action is already being processed. Please try again shortly.");
    }

    const result = await input.execute();
    await redis.set(completedKey, "1", "EX", ttlSeconds);
    return result;
  } catch (error) {
    if (error instanceof Error && error.message.includes("processed")) {
      throw error;
    }

    return runMemoryIdempotentOperation({
      cacheKey,
      ttlSeconds,
      lockSeconds,
      execute: input.execute,
      replay: input.replay
    });
  } finally {
    try {
      await redis.del(lockKey);
    } catch {
      // Best-effort cleanup only.
    }
  }
}
