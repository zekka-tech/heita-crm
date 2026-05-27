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
    // Only set the completed key after execute() succeeds. If this Redis write
    // fails, the lock expires naturally and a retry will re-execute — which is
    // safe because execute() is already inside a Prisma $transaction.
    try {
      await redis.set(completedKey, "1", "EX", ttlSeconds);
    } catch {
      // Best-effort; a Redis failure here just means the next call won't replay
      // and will re-execute. Prisma's unique constraints prevent double-writes.
    }
    return result;
  } catch (error) {
    // Re-throw all errors — never silently fall back to the in-memory store
    // after the Redis lock was acquired. The DB transaction may have already
    // committed, so re-executing via in-memory would double-process.
    throw error;
  } finally {
    try {
      await redis.del(lockKey);
    } catch {
      // Best-effort cleanup only.
    }
  }
}
