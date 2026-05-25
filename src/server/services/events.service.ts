import { Prisma, StaffRole } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/staff";
import { recordStaffAuditLog } from "@/server/services/staff-audit.service";

const EVENT_TRANSACTION_OPTIONS = {
  maxWait: 5_000,
  timeout: 15_000
};

const STAFF_VIEW_ROLES = [
  StaffRole.OWNER,
  StaffRole.MANAGER,
  StaffRole.STAFF
] as const;

const MANAGER_ROLES = [StaffRole.MANAGER] as const;

export type ListEventsForStaffInput = {
  businessId: string;
  userId: string;
};

export type StaffEventListEntry = {
  id: string;
  businessId: string;
  title: string;
  description: string | null;
  startsAt: Date;
  endsAt: Date | null;
  location: string | null;
  isReminderOn: boolean;
  createdAt: Date;
  updatedAt: Date;
  isPast: boolean;
};

export async function listEventsForStaff(
  input: ListEventsForStaffInput
): Promise<StaffEventListEntry[]> {
  await requireRole({
    businessId: input.businessId,
    userId: input.userId,
    allowedRoles: STAFF_VIEW_ROLES
  });

  const events = await prisma.event.findMany({
    where: { businessId: input.businessId },
    orderBy: { startsAt: "asc" }
  });

  const now = Date.now();
  return events.map((event) => {
    const endsAtMs = event.endsAt?.getTime() ?? event.startsAt.getTime();
    return {
      ...event,
      isPast: endsAtMs < now
    };
  });
}

function assertEventWindow(startsAt: Date, endsAt: Date | null | undefined) {
  if (!(startsAt instanceof Date) || Number.isNaN(startsAt.getTime())) {
    throw new Error("Event start date is invalid.");
  }
  if (endsAt) {
    if (!(endsAt instanceof Date) || Number.isNaN(endsAt.getTime())) {
      throw new Error("Event end date is invalid.");
    }
    if (endsAt.getTime() <= startsAt.getTime()) {
      throw new Error("Event end date must be after the start date.");
    }
  }
}

export type CreateEventInput = {
  businessId: string;
  actorUserId: string;
  title: string;
  description?: string | null;
  startsAt: Date;
  endsAt?: Date | null;
  location?: string | null;
  isReminderOn?: boolean;
};

export async function createEvent(input: CreateEventInput) {
  await requireRole({
    businessId: input.businessId,
    userId: input.actorUserId,
    allowedRoles: MANAGER_ROLES
  });

  const title = input.title.trim();
  if (!title) {
    throw new Error("Event title is required.");
  }

  assertEventWindow(input.startsAt, input.endsAt ?? null);

  return prisma.$transaction(async (tx) => {
    const event = await tx.event.create({
      data: {
        businessId: input.businessId,
        title,
        description: input.description?.trim() || null,
        startsAt: input.startsAt,
        endsAt: input.endsAt ?? null,
        location: input.location?.trim() || null,
        isReminderOn: input.isReminderOn ?? true
      }
    });

    await recordStaffAuditLog(
      {
        businessId: input.businessId,
        actorUserId: input.actorUserId,
        action: "event.create",
        targetType: "Event",
        targetId: event.id,
        metadata: {
          title: event.title,
          startsAt: event.startsAt.toISOString(),
          endsAt: event.endsAt?.toISOString() ?? null,
          location: event.location,
          isReminderOn: event.isReminderOn
        }
      },
      tx
    );

    return event;
  }, EVENT_TRANSACTION_OPTIONS);
}

export type UpdateEventInput = {
  eventId: string;
  actorUserId: string;
  title?: string;
  description?: string | null;
  startsAt?: Date;
  endsAt?: Date | null;
  location?: string | null;
  isReminderOn?: boolean;
};

export async function updateEvent(input: UpdateEventInput) {
  const existing = await prisma.event.findUniqueOrThrow({
    where: { id: input.eventId },
    select: {
      id: true,
      businessId: true,
      startsAt: true,
      endsAt: true
    }
  });

  await requireRole({
    businessId: existing.businessId,
    userId: input.actorUserId,
    allowedRoles: MANAGER_ROLES
  });

  const nextStartsAt = input.startsAt ?? existing.startsAt;
  const nextEndsAt =
    input.endsAt !== undefined ? input.endsAt : existing.endsAt ?? null;

  if (input.startsAt !== undefined || input.endsAt !== undefined) {
    assertEventWindow(nextStartsAt, nextEndsAt);
  }

  const data: Prisma.EventUpdateInput = {};
  if (input.title !== undefined) {
    if (!input.title.trim()) {
      throw new Error("Event title is required.");
    }
    data.title = input.title.trim();
  }
  if (input.description !== undefined) {
    data.description = input.description?.trim() || null;
  }
  if (input.startsAt !== undefined) {
    data.startsAt = input.startsAt;
  }
  if (input.endsAt !== undefined) {
    data.endsAt = input.endsAt;
  }
  if (input.location !== undefined) {
    data.location = input.location?.trim() || null;
  }
  if (input.isReminderOn !== undefined) {
    data.isReminderOn = input.isReminderOn;
  }

  return prisma.$transaction(async (tx) => {
    const event = await tx.event.update({
      where: { id: existing.id },
      data
    });

    await recordStaffAuditLog(
      {
        businessId: existing.businessId,
        actorUserId: input.actorUserId,
        action: "event.update",
        targetType: "Event",
        targetId: event.id,
        metadata: {
          changed: Object.keys(data)
        }
      },
      tx
    );

    return event;
  }, EVENT_TRANSACTION_OPTIONS);
}

export type DeleteEventInput = {
  eventId: string;
  actorUserId: string;
};

export async function deleteEvent(input: DeleteEventInput) {
  const existing = await prisma.event.findUniqueOrThrow({
    where: { id: input.eventId },
    select: { id: true, businessId: true, title: true }
  });

  await requireRole({
    businessId: existing.businessId,
    userId: input.actorUserId,
    allowedRoles: MANAGER_ROLES
  });

  return prisma.$transaction(async (tx) => {
    const event = await tx.event.delete({
      where: { id: existing.id }
    });

    await recordStaffAuditLog(
      {
        businessId: existing.businessId,
        actorUserId: input.actorUserId,
        action: "event.delete",
        targetType: "Event",
        targetId: existing.id,
        metadata: {
          title: existing.title
        }
      },
      tx
    );

    return event;
  }, EVENT_TRANSACTION_OPTIONS);
}
