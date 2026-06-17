import { withSystemScope } from "@/lib/prisma";
import { router, protectedProcedure } from "@/server/trpc";

export const businessRouter = router({
  listMine: protectedProcedure.query(async ({ ctx }) => {
    // Spans every business the caller staffs (legitimate cross-tenant read):
    // run under system scope with the session-bound staff-membership filter.
    return withSystemScope((tx) =>
      tx.business.findMany({
        where: {
          staffMembers: {
            some: {
              userId: ctx.userId
            }
          }
        },
        orderBy: {
          createdAt: "desc"
        },
        take: 50
      })
    );
  })
});
