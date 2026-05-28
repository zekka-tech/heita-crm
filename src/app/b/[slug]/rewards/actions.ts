"use server";

import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { requireCsrfFormData } from "@/lib/csrf";
import { enforceRateLimit } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";
import { redeemPoints } from "@/server/services/loyalty.service";

export async function redeemRewardAction(formData: FormData) {
  await requireCsrfFormData(formData);

  const session = await auth();
  const userId = session?.user?.id;
  const businessId = String(formData.get("businessId") ?? "");
  const slug = String(formData.get("slug") ?? "");
  const rewardId = String(formData.get("rewardId") ?? "");
  const idempotencyKey = String(formData.get("idempotencyKey") ?? "");

  if (!userId) {
    redirect(`/sign-in?callbackUrl=/b/${slug}/rewards`);
  }

  const rl = await enforceRateLimit({
    identifier: `reward:redeem:${userId}`,
    windowSeconds: 60,
    max: 10
  });
  if (!rl.allowed) {
    throw new Error("Too many redemption attempts. Please wait a moment and try again.");
  }

  const membership = await prisma.membership.findUnique({
    where: {
      businessId_userId: {
        businessId,
        userId
      }
    }
  });

  if (!membership) {
    redirect(`/b/${slug}/join`);
  }

  await redeemPoints({
    businessId,
    membershipId: membership.id,
    rewardId,
    actorUserId: userId,
    idempotencyKey
  });

  redirect(`/b/${slug}/rewards?redeemed=1`);
}
