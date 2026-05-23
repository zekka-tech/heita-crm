"use server";

import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { earnPoints, redeemPoints } from "@/server/services/loyalty.service";

async function assertStaffAccess(businessId: string, userId: string) {
  const staff = await prisma.staffMember.findUnique({
    where: {
      businessId_userId: {
        businessId,
        userId
      }
    }
  });

  if (!staff) {
    throw new Error("You do not have access to manage this business.");
  }
}

export async function earnPointsAction(formData: FormData) {
  const session = await auth();
  const userId = session?.user?.id;
  const businessId = String(formData.get("businessId") ?? "");
  const membershipId = String(formData.get("membershipId") ?? "");
  const points = Number(formData.get("points") ?? 0);
  const description = String(formData.get("description") ?? "").trim() || null;

  if (!userId) {
    redirect(`/sign-in?callbackUrl=/dashboard/${businessId}/loyalty`);
  }

  await assertStaffAccess(businessId, userId);

  await earnPoints({
    businessId,
    membershipId,
    points,
    actorUserId: userId,
    description
  });

  redirect(`/dashboard/${businessId}/loyalty?updated=earn`);
}

export async function redeemPointsAction(formData: FormData) {
  const session = await auth();
  const userId = session?.user?.id;
  const businessId = String(formData.get("businessId") ?? "");
  const membershipId = String(formData.get("membershipId") ?? "");
  const points = Number(formData.get("points") ?? 0);
  const description = String(formData.get("description") ?? "").trim() || null;

  if (!userId) {
    redirect(`/sign-in?callbackUrl=/dashboard/${businessId}/loyalty`);
  }

  await assertStaffAccess(businessId, userId);

  await redeemPoints({
    businessId,
    membershipId,
    points,
    actorUserId: userId,
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

  await assertStaffAccess(businessId, userId);

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

