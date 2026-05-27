import { Prisma } from "@prisma/client";

import { sendEmail } from "@/lib/email";
import { logger } from "@/lib/logger";
import {
  getBusinessNotificationPreference,
  isWithinQuietHours,
  normalizeNotificationPreferences
} from "@/lib/notification-preferences";
import { prisma } from "@/lib/prisma";
import { sendPushToUser } from "@/lib/push";

type NotificationInput = {
  userId: string;
  businessId?: string | null;
  title: string;
  body: string;
  type: string;
  actionUrl?: string | null;
  metadata?: Record<string, unknown>;
};

export async function sendNotification(input: NotificationInput) {
  const user = await prisma.user.findFirst({
    where: { id: input.userId, deletedAt: null },
    select: {
      email: true,
      notificationPreferences: true
    }
  });

  if (!user) {
    return null;
  }

  const preferences = normalizeNotificationPreferences(user.notificationPreferences);
  const businessPreference = getBusinessNotificationPreference(
    preferences,
    input.businessId
  );
  const quietHoursActive = isWithinQuietHours({
    quietHours: businessPreference.quietHours
  });

  const notification = businessPreference.channels.inApp
    ? await prisma.notification.create({
        data: {
          userId: input.userId,
          title: input.title,
          body: input.body,
          type: input.type,
          actionUrl: input.actionUrl ?? null,
          metadata: input.metadata as Prisma.InputJsonValue | undefined
        }
      })
    : null;

  const deliveries: Promise<unknown>[] = [];

  if (businessPreference.channels.push && !quietHoursActive) {
    deliveries.push(
      sendPushToUser({
        userId: input.userId,
        title: input.title,
        body: input.body,
        url: input.actionUrl
      })
    );
  }

  if (user.email && businessPreference.channels.email && !quietHoursActive) {
    deliveries.push(
      sendEmail({
        to: user.email,
        subject: input.title,
        text: input.body,
        html: `<p>${input.body}</p>`
      })
    );
  }

  const results = await Promise.allSettled(deliveries);
  for (const result of results) {
    if (result.status === "rejected") {
      logger.error({ err: result.reason, userId: input.userId }, "notification.delivery_failed");
    }
  }

  return notification;
}
