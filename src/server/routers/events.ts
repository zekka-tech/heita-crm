import { router, protectedProcedure } from "@/server/trpc";

export const eventsRouter = router({
  upcoming: protectedProcedure.query(async ({ ctx }: { ctx: any }) => {
    return ctx.prisma.event.findMany({
      where: {
        business: {
          staffMembers: {
            some: {
              userId: ctx.userId
            }
          }
        }
      },
      orderBy: {
        startsAt: "asc"
      },
      take: 20
    });
  })
});
