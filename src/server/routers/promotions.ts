import { router, protectedProcedure } from "@/server/trpc";

export const promotionsRouter = router({
  active: protectedProcedure.query(async ({ ctx }: { ctx: any }) => {
    return ctx.prisma.promotion.findMany({
      where: {
        business: {
          staffMembers: {
            some: {
              userId: ctx.userId
            }
          }
        },
        isActive: true
      },
      orderBy: {
        startsAt: "desc"
      },
      take: 20
    });
  })
});
