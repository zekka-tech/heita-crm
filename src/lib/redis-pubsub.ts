import { logger } from "@/lib/logger";
import { getRedis } from "@/lib/redis";

export async function publishEvent(channel: string, message: object): Promise<void> {
  const redis = getRedis();
  if (!redis) {
    logger.warn({ channel }, "redis-pubsub.publish.no_redis");
    return;
  }

  try {
    const payload = JSON.stringify(message);
    await redis.publish(channel, payload);
  } catch (err) {
    logger.error({ err, channel }, "redis-pubsub.publish.error");
  }
}

export async function subscribeToChannel(
  channel: string,
  handler: (msg: object) => void
): Promise<() => void> {
  const redis = getRedis();
  if (!redis) {
    logger.warn({ channel }, "redis-pubsub.subscribe.no_redis");
    return () => {};
  }

  const sub = redis.duplicate();
  let unsubscribed = false;

  try {
    await sub.subscribe(channel);
  } catch (err) {
    logger.error({ err, channel }, "redis-pubsub.subscribe.error");
    sub.disconnect();
    return () => {};
  }

  const messageHandler = (chn: string, message: string) => {
    if (unsubscribed) return;
    try {
      const parsed = JSON.parse(message) as object;
      handler(parsed);
    } catch (err) {
      logger.error({ err, channel }, "redis-pubsub.parse.error");
    }
  };

  sub.on("message", messageHandler);

  return () => {
    unsubscribed = true;
    sub.off("message", messageHandler);
    sub.unsubscribe(channel).catch(() => {});
    sub.disconnect();
  };
}
