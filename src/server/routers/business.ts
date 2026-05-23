import { router, protectedProcedure } from "@/server/trpc";

export const businessRouter = router({
  listMine: protectedProcedure.query(async ({ ctx }) => {
    return ctx.prisma.business.findMany({
      where: {
        staffMembers: {
          some: {
            userId: ctx.userId
          }
        }
      },
      orderBy: {
        createdAt: "desc"
      }
    });
  })
});
