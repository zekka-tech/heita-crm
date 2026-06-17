import { z } from "zod";

import { withBusinessScope, withUserScope } from "@/lib/prisma";
import { router, protectedProcedure } from "@/server/trpc";

export const loyaltyRouter = router({
  wallet: protectedProcedure.query(async ({ ctx }) => {
    // Customer reading their own memberships: scope by user so RLS
    // (Membership_user_self_read + LoyaltyTier/Transaction user-read policies)
    // returns rows under the non-BYPASSRLS app role.
    return withUserScope(ctx.userId, (tx) =>
      tx.membership.findMany({
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
      })
    );
  }),

  referralCode: protectedProcedure
    .input(z.object({ businessId: z.string() }))
    .query(async ({ ctx, input }) => {
      // ReferralCode is business-scoped; the row lives under input.businessId.
      // Scope to that business (the ownerUserId filter keeps it to the caller's
      // own code) so the read resolves under the app role.
      const referralCode = await withBusinessScope(input.businessId, (tx) =>
        tx.referralCode.findFirst({
          where: {
            businessId: input.businessId,
            ownerUserId: ctx.userId,
            isActive: true
          },
          select: {
            code: true,
            business: { select: { slug: true } }
          }
        })
      );

      if (!referralCode) {
        return null;
      }

      return {
        code: referralCode.code,
        businessSlug: referralCode.business.slug
      };
    })
});
