"use server";

import { StaffRole } from "@prisma/client";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/staff";
import { earnPoints, redeemPoints } from "@/server/services/loyalty.service";

export async function earnPointsAction(formData: FormData) {
  const session = await auth();
  const userId = session?.user?.id;
  const businessId = String(formData.get("businessId") ?? "");
  const membershipId = String(formData.get("membershipId") ?? "");
  const idempotencyKey = String(formData.get("idempotencyKey") ?? "");
  const points = Number(formData.get("points") ?? 0);
  const description = String(formData.get("description") ?? "").trim() || null;

  if (!userId) {
    redirect(`/sign-in?callbackUrl=/dashboard/${businessId}/loyalty`);
  }

  await requireRole({
    businessId,
    userId,
    allowedRoles: [StaffRole.STAFF]
  });

  await earnPoints({
    businessId,
    membershipId,
    points,
    actorUserId: userId,
    idempotencyKey,
    description
  });

  redirect(`/dashboard/${businessId}/loyalty?updated=earn`);
}

export async function redeemPointsAction(formData: FormData) {
  const session = await auth();
  const userId = session?.user?.id;
  const businessId = String(formData.get("businessId") ?? "");
  const membershipId = String(formData.get("membershipId") ?? "");
  const idempotencyKey = String(formData.get("idempotencyKey") ?? "");
  const points = Number(formData.get("points") ?? 0);
  const description = String(formData.get("description") ?? "").trim() || null;

  if (!userId) {
    redirect(`/sign-in?callbackUrl=/dashboard/${businessId}/loyalty`);
  }

  await requireRole({
    businessId,
    userId,
    allowedRoles: [StaffRole.MANAGER]
  });

  await redeemPoints({
    businessId,
    membershipId,
    points,
    actorUserId: userId,
    idempotencyKey,
    description
  });

  redirect(`/dashboard/${businessId}/loyalty?updated=redeem`);
}

export async function createRewardAction(formData: FormData) {
  const session = await auth();
  const userId = session?.user?.id;
  const businessId = String(formData.get("businessId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const pointsCost = Number(formData.get("pointsCost") ?? 0);
  const stockValue = String(formData.get("stock") ?? "").trim();

  if (!userId) {
    redirect(`/sign-in?callbackUrl=/dashboard/${businessId}/loyalty`);
  }

  await requireRole({
    businessId,
    userId,
    allowedRoles: [StaffRole.MANAGER]
  });

  if (!title || !Number.isFinite(pointsCost) || pointsCost <= 0) {
    throw new Error("Reward title and points cost are required.");
  }

  await prisma.reward.create({
    data: {
      businessId,
      title,
      description,
      pointsCost,
      stock: stockValue ? Number(stockValue) : null
    }
  });

  redirect(`/dashboard/${businessId}/loyalty?updated=reward`);
}
