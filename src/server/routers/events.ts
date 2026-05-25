import { z } from "zod";

import { protectedProcedure, router } from "@/server/trpc";
import {
  createEvent,
  deleteEvent,
  listEventsForStaff,
  updateEvent
} from "@/server/services/events.service";

const createInputSchema = z.object({
  businessId: z.string().min(1),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional().nullable(),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date().optional().nullable(),
  location: z.string().trim().max(200).optional().nullable(),
  isReminderOn: z.boolean().optional()
});

const updateInputSchema = z.object({
  eventId: z.string().min(1),
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(2000).optional().nullable(),
  startsAt: z.coerce.date().optional(),
  endsAt: z.coerce.date().optional().nullable(),
  location: z.string().trim().max(200).optional().nullable(),
  isReminderOn: z.boolean().optional()
});

export const eventsRouter = router({
  upcoming: protectedProcedure.query(async ({ ctx }) => {
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
  }),

  list: protectedProcedure
    .input(z.object({ businessId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      return listEventsForStaff({
        businessId: input.businessId,
        userId: ctx.userId
      });
    }),

  create: protectedProcedure
    .input(createInputSchema)
    .mutation(async ({ ctx, input }) => {
      return createEvent({
        businessId: input.businessId,
        actorUserId: ctx.userId,
        title: input.title,
        description: input.description ?? null,
        startsAt: input.startsAt,
        endsAt: input.endsAt ?? null,
        location: input.location ?? null,
        isReminderOn: input.isReminderOn
      });
    }),

  update: protectedProcedure
    .input(updateInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { eventId, ...patch } = input;
      return updateEvent({
        eventId,
        actorUserId: ctx.userId,
        ...patch
      });
    }),

  delete: protectedProcedure
    .input(z.object({ eventId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      return deleteEvent({
        eventId: input.eventId,
        actorUserId: ctx.userId
      });
    })
});
