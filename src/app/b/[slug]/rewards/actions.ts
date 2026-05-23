"use server";

import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redeemPoints } from "@/server/services/loyalty.service";

export async function redeemRewardAction(formData: FormData) {
  const session = await auth();
  const userId = session?.user?.id;
  const businessId = String(formData.get("businessId") ?? "");
  const slug = String(formData.get("slug") ?? "");
  const rewardId = String(formData.get("rewardId") ?? "");

  if (!userId) {
    redirect(`/sign-in?callbackUrl=/b/${slug}/rewards`);
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
    actorUserId: userId
  });

  redirect(`/b/${slug}/rewards?redeemed=1`);
}

