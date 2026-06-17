import { withUserScope } from "@/lib/prisma";
import { router, protectedProcedure } from "@/server/trpc";

export const membershipRouter = router({
  myMemberships: protectedProcedure.query(async ({ ctx }) => {
    // Customer self-read: scope by user so Membership_user_self_read applies
    // under the non-BYPASSRLS app role.
    return withUserScope(ctx.userId, (tx) =>
      tx.membership.findMany({
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
      })
    );
  })
});
