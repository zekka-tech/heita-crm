"use server";

import { PromotionType, StaffRole } from "@prisma/client";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { requireCsrfFormData } from "@/lib/csrf";
import { requireRole } from "@/lib/staff";
import {
  broadcastPromotion,
  createPromotion,
  deletePromotion,
  updatePromotion
} from "@/server/services/promotions.service";

function parseDate(value: FormDataEntryValue | null): Date {
  const raw = typeof value === "string" ? value.trim() : "";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Provide a valid date.");
  }
  return date;
}

function parsePromotionType(value: FormDataEntryValue | null): PromotionType {
  const raw = typeof value === "string" ? value : "";
  if (!Object.values(PromotionType).includes(raw as PromotionType)) {
    throw new Error("Select a promotion type.");
  }
  return raw as PromotionType;
}

function parseTargetTierIds(formData: FormData): string[] {
  return formData
    .getAll("targetTierIds")
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter((value) => value.length > 0);
}

export async function createPromotionAction(formData: FormData) {
  await requireCsrfFormData(formData);

  const session = await auth();
  const userId = session?.user?.id;
  const businessId = String(formData.get("businessId") ?? "");

  if (!userId) {
    redirect(`/sign-in?callbackUrl=/dashboard/${businessId}/promotions`);
  }

  await requireRole({ businessId, userId, allowedRoles: [StaffRole.OWNER, StaffRole.MANAGER] });

  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const type = parsePromotionType(formData.get("type"));
  const startsAt = parseDate(formData.get("startsAt"));
  const endsAt = parseDate(formData.get("endsAt"));
  const imageUrl = String(formData.get("imageUrl") ?? "").trim() || null;
  const code = String(formData.get("code") ?? "").trim() || null;
  const targetTierIds = parseTargetTierIds(formData);

  await createPromotion({
    businessId,
    actorUserId: userId,
    title,
    description,
    type,
    startsAt,
    endsAt,
    imageUrl,
    code,
    targetTierIds
  });

  redirect(`/dashboard/${businessId}/promotions?updated=created`);
}

export async function updatePromotionAction(formData: FormData) {
  await requireCsrfFormData(formData);

  const session = await auth();
  const userId = session?.user?.id;
  const businessId = String(formData.get("businessId") ?? "");
  const promotionId = String(formData.get("promotionId") ?? "");

  if (!userId) {
    redirect(`/sign-in?callbackUrl=/dashboard/${businessId}/promotions`);
  }

  await requireRole({ businessId, userId, allowedRoles: [StaffRole.OWNER, StaffRole.MANAGER] });

  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const type = parsePromotionType(formData.get("type"));
  const startsAt = parseDate(formData.get("startsAt"));
  const endsAt = parseDate(formData.get("endsAt"));
  const imageUrl = String(formData.get("imageUrl") ?? "").trim() || null;
  const code = String(formData.get("code") ?? "").trim() || null;
  const targetTierIds = parseTargetTierIds(formData);

  await updatePromotion({
    promotionId,
    actorUserId: userId,
    title,
    description,
    type,
    startsAt,
    endsAt,
    imageUrl,
    code,
    targetTierIds
  });

  redirect(`/dashboard/${businessId}/promotions?updated=updated`);
}

export async function deletePromotionAction(formData: FormData) {
  await requireCsrfFormData(formData);

  const session = await auth();
  const userId = session?.user?.id;
  const businessId = String(formData.get("businessId") ?? "");
  const promotionId = String(formData.get("promotionId") ?? "");

  if (!userId) {
    redirect(`/sign-in?callbackUrl=/dashboard/${businessId}/promotions`);
  }

  await requireRole({ businessId, userId, allowedRoles: [StaffRole.OWNER, StaffRole.MANAGER] });

  await deletePromotion({
    promotionId,
    actorUserId: userId
  });

  redirect(`/dashboard/${businessId}/promotions?updated=deleted`);
}

export async function broadcastPromotionAction(formData: FormData) {
  await requireCsrfFormData(formData);

  const session = await auth();
  const userId = session?.user?.id;
  const businessId = String(formData.get("businessId") ?? "");
  const promotionId = String(formData.get("promotionId") ?? "");

  if (!userId) {
    redirect(`/sign-in?callbackUrl=/dashboard/${businessId}/promotions`);
  }

  await requireRole({ businessId, userId, allowedRoles: [StaffRole.OWNER, StaffRole.MANAGER] });

  await broadcastPromotion({
    promotionId,
    actorUserId: userId
  });

  redirect(`/dashboard/${businessId}/promotions?updated=broadcast`);
}
