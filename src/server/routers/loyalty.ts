import { z } from "zod";

import { router, protectedProcedure } from "@/server/trpc";

export const loyaltyRouter = router({
  wallet: protectedProcedure.query(async ({ ctx }) => {
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
  }),

  referralCode: protectedProcedure
    .input(z.object({ businessId: z.string() }))
    .query(async ({ ctx, input }) => {
      const referralCode = await ctx.prisma.referralCode.findFirst({
        where: {
          businessId: input.businessId,
          ownerUserId: ctx.userId,
          isActive: true
        },
        select: {
          code: true,
          business: { select: { slug: true } }
        }
      });

      if (!referralCode) {
        return null;
      }

      return {
        code: referralCode.code,
        businessSlug: referralCode.business.slug
      };
    })
});
