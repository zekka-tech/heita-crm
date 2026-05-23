import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

type NotificationInput = {
  userId: string;
  title: string;
  body: string;
  type: string;
  actionUrl?: string | null;
  metadata?: Record<string, unknown>;
};

export async function sendNotification(input: NotificationInput) {
  return prisma.notification.create({
    data: {
      userId: input.userId,
      title: input.title,
      body: input.body,
      type: input.type,
      actionUrl: input.actionUrl ?? null,
      metadata: input.metadata as Prisma.InputJsonValue | undefined
    }
  });
}
