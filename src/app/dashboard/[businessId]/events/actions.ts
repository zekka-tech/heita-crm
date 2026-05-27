"use server";

import { StaffRole } from "@prisma/client";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { requireCsrfFormData } from "@/lib/csrf";
import { requireRole } from "@/lib/staff";
import {
  createEvent,
  deleteEvent,
  updateEvent
} from "@/server/services/events.service";

function parseDate(value: FormDataEntryValue | null): Date {
  const raw = typeof value === "string" ? value.trim() : "";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Provide a valid date.");
  }
  return date;
}

function parseOptionalDate(value: FormDataEntryValue | null): Date | null {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Provide a valid end date.");
  }
  return date;
}

export async function createEventAction(formData: FormData) {
  await requireCsrfFormData(formData);

  const session = await auth();
  const userId = session?.user?.id;
  const businessId = String(formData.get("businessId") ?? "");

  if (!userId) {
    redirect(`/sign-in?callbackUrl=/dashboard/${businessId}/events`);
  }

  await requireRole({ businessId, userId, allowedRoles: [StaffRole.OWNER, StaffRole.MANAGER] });

  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const startsAt = parseDate(formData.get("startsAt"));
  const endsAt = parseOptionalDate(formData.get("endsAt"));
  const location = String(formData.get("location") ?? "").trim() || null;
  const isReminderOn = formData.get("isReminderOn") === "on";

  await createEvent({
    businessId,
    actorUserId: userId,
    title,
    description,
    startsAt,
    endsAt,
    location,
    isReminderOn
  });

  redirect(`/dashboard/${businessId}/events?updated=created`);
}

export async function updateEventAction(formData: FormData) {
  await requireCsrfFormData(formData);

  const session = await auth();
  const userId = session?.user?.id;
  const businessId = String(formData.get("businessId") ?? "");
  const eventId = String(formData.get("eventId") ?? "");

  if (!userId) {
    redirect(`/sign-in?callbackUrl=/dashboard/${businessId}/events`);
  }

  await requireRole({ businessId, userId, allowedRoles: [StaffRole.OWNER, StaffRole.MANAGER] });

  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const startsAt = parseDate(formData.get("startsAt"));
  const endsAt = parseOptionalDate(formData.get("endsAt"));
  const location = String(formData.get("location") ?? "").trim() || null;
  const isReminderOn = formData.get("isReminderOn") === "on";

  await updateEvent({
    eventId,
    businessId,
    actorUserId: userId,
    title,
    description,
    startsAt,
    endsAt,
    location,
    isReminderOn
  });

  redirect(`/dashboard/${businessId}/events?updated=updated`);
}

export async function deleteEventAction(formData: FormData) {
  await requireCsrfFormData(formData);

  const session = await auth();
  const userId = session?.user?.id;
  const businessId = String(formData.get("businessId") ?? "");
  const eventId = String(formData.get("eventId") ?? "");

  if (!userId) {
    redirect(`/sign-in?callbackUrl=/dashboard/${businessId}/events`);
  }

  await requireRole({ businessId, userId, allowedRoles: [StaffRole.OWNER, StaffRole.MANAGER] });

  await deleteEvent({
    eventId,
    businessId,
    actorUserId: userId
  });

  redirect(`/dashboard/${businessId}/events?updated=deleted`);
}
