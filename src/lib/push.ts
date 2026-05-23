import webpush, { type PushSubscription as WebPushSubscription } from "web-push";

import { prisma } from "@/lib/prisma";

let configured = false;

export function configureWebPush() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;

  const ready = Boolean(publicKey && privateKey && subject);
  if (ready && !configured) {
    webpush.setVapidDetails(subject!, publicKey!, privateKey!);
    configured = true;
  }

  return { configured: ready, publicKey: publicKey ?? null };
}

export async function sendPushToUser(input: {
  userId: string;
  title: string;
  body: string;
  url?: string | null;
}) {
  const state = configureWebPush();
  if (!state.configured) {
    return { delivered: 0, skipped: true };
  }

  const subscriptions = await prisma.pushSubscription.findMany({
    where: { userId: input.userId }
  });

  let delivered = 0;

  for (const subscription of subscriptions) {
    try {
      await webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: {
            p256dh: subscription.p256dh,
            auth: subscription.auth
          }
        } satisfies WebPushSubscription,
        JSON.stringify({
          title: input.title,
          body: input.body,
          url: input.url ?? "/notifications"
        })
      );
      delivered += 1;
    } catch (error) {
      const statusCode =
        typeof error === "object" &&
        error !== null &&
        "statusCode" in error &&
        typeof error.statusCode === "number"
          ? error.statusCode
          : null;

      if (statusCode === 404 || statusCode === 410) {
        await prisma.pushSubscription.delete({
          where: { endpoint: subscription.endpoint }
        });
      }
    }
  }

  return { delivered, skipped: false };
}
