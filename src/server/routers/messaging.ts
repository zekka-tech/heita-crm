import { withUserScope } from "@/lib/prisma";
import { router, protectedProcedure } from "@/server/trpc";

export const messagingRouter = router({
  inbox: protectedProcedure.query(async ({ ctx }) => {
    // Customer self-read: scope by user so Message_user_conversation_read
    // applies under the non-BYPASSRLS app role.
    return withUserScope(ctx.userId, (tx) =>
      tx.message.findMany({
        where: {
          userId: ctx.userId
        },
        orderBy: {
          createdAt: "desc"
        },
        take: 50
      })
    );
  })
});
