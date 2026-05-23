import { router, protectedProcedure } from "@/server/trpc";

export const loyaltyRouter = router({
  wallet: protectedProcedure.query(async ({ ctx }: { ctx: any }) => {
    return ctx.prisma.membership.findMany({
      where: {
        userId: ctx.userId
      },
      select: {
        id: true,
        pointsBalance: true,
        business: {
          select: {
            id: true,
            name: true,
            slug: true
          }
        },
        tier: {
          select: {
            name: true,
            minPoints: true
          }
        },
        transactions: {
          orderBy: {
            createdAt: "desc"
          },
          take: 5
        }
      }
    });
  })
});
