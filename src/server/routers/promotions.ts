import { PromotionType } from "@prisma/client";
import { z } from "zod";

import { withSystemScope } from "@/lib/prisma";
import { protectedProcedure, router } from "@/server/trpc";
import {
  broadcastPromotion,
  createPromotion,
  deletePromotion,
  listPromotions,
  updatePromotion
} from "@/server/services/promotions.service";

const promotionTypeSchema = z.nativeEnum(PromotionType);

const createInputSchema = z.object({
  businessId: z.string().min(1),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional().nullable(),
  type: promotionTypeSchema,
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  imageUrl: z.string().trim().url().max(2048).optional().nullable(),
  code: z.string().trim().max(64).optional().nullable(),
  targetTierIds: z.array(z.string().min(1)).default([])
});

const updateInputSchema = z.object({
  promotionId: z.string().min(1),
  businessId: z.string().min(1),
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(2000).optional().nullable(),
  type: promotionTypeSchema.optional(),
  startsAt: z.coerce.date().optional(),
  endsAt: z.coerce.date().optional(),
  imageUrl: z.string().trim().url().max(2048).optional().nullable(),
  code: z.string().trim().max(64).optional().nullable(),
  targetTierIds: z.array(z.string().min(1)).optional(),
  isActive: z.boolean().optional()
});

export const promotionsRouter = router({
  active: protectedProcedure.query(async ({ ctx }) => {
    // Spans every business the caller staffs (legitimate cross-tenant read):
    // run under system scope with the session-bound staff-membership filter.
    return withSystemScope((tx) =>
      tx.promotion.findMany({
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
      })
    );
  }),

  list: protectedProcedure
    .input(z.object({ businessId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      return listPromotions({
        businessId: input.businessId,
        userId: ctx.userId
      });
    }),

  create: protectedProcedure
    .input(createInputSchema)
    .mutation(async ({ ctx, input }) => {
      return createPromotion({
        businessId: input.businessId,
        actorUserId: ctx.userId,
        title: input.title,
        description: input.description ?? null,
        type: input.type,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        imageUrl: input.imageUrl ?? null,
        code: input.code ?? null,
        targetTierIds: input.targetTierIds
      });
    }),

  update: protectedProcedure
    .input(updateInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { promotionId, ...patch } = input;
      return updatePromotion({
        promotionId,
        actorUserId: ctx.userId,
        ...patch
      });
    }),

  delete: protectedProcedure
    .input(z.object({ promotionId: z.string().min(1), businessId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      return deletePromotion({
        promotionId: input.promotionId,
        businessId: input.businessId,
        actorUserId: ctx.userId
      });
    }),

  broadcast: protectedProcedure
    .input(z.object({ promotionId: z.string().min(1), businessId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      return broadcastPromotion({
        promotionId: input.promotionId,
        businessId: input.businessId,
        actorUserId: ctx.userId
      });
    })
});
