import { router, protectedProcedure } from "@/server/trpc";

export const messagingRouter = router({
  inbox: protectedProcedure.query(async ({ ctx }: { ctx: any }) => {
    return ctx.prisma.message.findMany({
      where: {
        userId: ctx.userId
      },
      orderBy: {
        createdAt: "desc"
      },
      take: 50
    });
  })
});
