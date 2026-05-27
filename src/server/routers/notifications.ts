import { z } from "zod";

import { protectedProcedure, router } from "@/server/trpc";

export const notificationsRouter = router({
  unreadCount: protectedProcedure.query(async ({ ctx }) => {
    const count = await ctx.prisma.notification.count({
      where: { userId: ctx.userId, readAt: null }
    });
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
      return ctx.prisma.notification.findMany({
        where: {
          userId: ctx.userId
        },
        orderBy: {
          createdAt: "desc"
        },
        take: input?.limit ?? 50
      });
    })
});
