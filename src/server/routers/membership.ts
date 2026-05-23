import { router, protectedProcedure } from "@/server/trpc";

export const membershipRouter = router({
  myMemberships: protectedProcedure.query(async ({ ctx }: { ctx: any }) => {
    return ctx.prisma.membership.findMany({
      where: {
        userId: ctx.userId
      },
      include: {
        business: true,
        tier: true
      },
      orderBy: {
        joinedAt: "desc"
      }
    });
  })
});
