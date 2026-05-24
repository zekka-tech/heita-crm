import { Prisma } from "@prisma/client";

import { sendEmail } from "@/lib/email";
import { prisma } from "@/lib/prisma";
import { sendPushToUser } from "@/lib/push";

type NotificationInput = {
  userId: string;
  title: string;
  body: string;
  type: string;
  actionUrl?: string | null;
  metadata?: Record<string, unknown>;
};

export async function sendNotification(input: NotificationInput) {
  const notification = await prisma.notification.create({
    data: {
      userId: input.userId,
      title: input.title,
      body: input.body,
      type: input.type,
      actionUrl: input.actionUrl ?? null,
      metadata: input.metadata as Prisma.InputJsonValue | undefined
    }
  });

  const user = await prisma.user.findFirst({
    where: { id: input.userId, deletedAt: null },
    select: {
      email: true
    }
  });

  await Promise.allSettled([
    sendPushToUser({
      userId: input.userId,
      title: input.title,
      body: input.body,
      url: input.actionUrl
    }),
    user?.email
      ? sendEmail({
          to: user.email,
          subject: input.title,
          text: input.body,
          html: `<p>${input.body}</p>`
        })
      : Promise.resolve(null)
  ]);

  return notification;
}
