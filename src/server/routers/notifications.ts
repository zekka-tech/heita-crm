import { z } from "zod";

import { withUserScope } from "@/lib/prisma";
import { protectedProcedure, router } from "@/server/trpc";

export const notificationsRouter = router({
  unreadCount: protectedProcedure.query(async ({ ctx }) => {
    const count = await withUserScope(ctx.userId, (tx) =>
      tx.notification.count({
        where: { userId: ctx.userId, readAt: null }
      })
    );
    return { count };
  }),

  recent: protectedProcedure
    .input(
      z
        .object({
          limit: z.number().int().min(1).max(100).default(50)
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      return withUserScope(ctx.userId, (tx) =>
        tx.notification.findMany({
          where: { userId: ctx.userId },
          orderBy: { createdAt: "desc" },
          take: input?.limit ?? 50
        })
      );
    })
});
