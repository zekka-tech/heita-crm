import { logger } from "@/lib/logger";
import { withUserScope } from "@/lib/prisma";
import { publishEvent } from "@/lib/redis-pubsub";
import { getRedis } from "@/lib/redis";

const PRESENCE_TTL_SECONDS = 30;
const TYPING_TTL_SECONDS = 5;
const HEARTBEAT_INTERVAL_SECONDS = 20;

export function presenceKey(userId: string): string {
  return `presence:${userId}`;
}

export function typingKey(conversationId: string, userId: string): string {
  return `typing:${conversationId}:${userId}`;
}

export async function setPresence(userId: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  try {
    await redis.set(presenceKey(userId), "1", "EX", PRESENCE_TTL_SECONDS);
  } catch (err) {
    logger.error({ err, userId }, "presence.set.error");
  }
}

export async function isUserOnline(userId: string): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return false;

  try {
    const value = await redis.get(presenceKey(userId));
    return value === "1";
  } catch {
    return false;
  }
}

export async function setTyping(
  conversationId: string,
  userId: string
): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  try {
    await redis.set(typingKey(conversationId, userId), "1", "EX", TYPING_TTL_SECONDS);

    const participants = await withUserScope(userId, (tx) =>
      tx.conversationParticipant.findMany({
        where: { conversationId },
        select: { userId: true }
      })
    );

    for (const p of participants) {
      if (p.userId === userId) continue;
      await publishEvent(`user:${p.userId}:events`, {
        type: "typing",
        conversationId,
        userId,
        isTyping: true
      });
    }
  } catch (err) {
    logger.error({ err, conversationId, userId }, "presence.typing.set.error");
  }
}

export async function clearTyping(
  conversationId: string,
  userId: string
): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  try {
    await redis.del(typingKey(conversationId, userId));

    const participants = await withUserScope(userId, (tx) =>
      tx.conversationParticipant.findMany({
        where: { conversationId },
        select: { userId: true }
      })
    );

    for (const p of participants) {
      if (p.userId === userId) continue;
      await publishEvent(`user:${p.userId}:events`, {
        type: "typing",
        conversationId,
        userId,
        isTyping: false
      });
    }
  } catch (err) {
    logger.error({ err, conversationId, userId }, "presence.typing.clear.error");
  }
}

export async function getOnlineParticipants(
  userIds: string[]
): Promise<Set<string>> {
  const redis = getRedis();
  if (!redis || !userIds.length) return new Set();

  try {
    const pipeline = redis.pipeline();
    for (const uid of userIds) {
      pipeline.get(presenceKey(uid));
    }
    const results = await pipeline.exec();
    const online = new Set<string>();
    if (results) {
      for (let i = 0; i < results.length; i++) {
        const [err, value] = results[i]!;
        if (!err && value === "1" && userIds[i]) {
          online.add(userIds[i]!);
        }
      }
    }
    return online;
  } catch {
    return new Set();
  }
}

export function getHeartbeatIntervalSeconds(): number {
  return HEARTBEAT_INTERVAL_SECONDS;
}

export function getPresenceTtlSeconds(): number {
  return PRESENCE_TTL_SECONDS;
}
