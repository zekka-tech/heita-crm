"use server";

import { StaffRole } from "@prisma/client";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { requireCsrfFormData } from "@/lib/csrf";
import { requireRole } from "@/lib/staff";
import { ReachPackError, purchaseReachPackWithCredit } from "@/server/services/reach-pack.service";

export async function purchaseReachPackAction(formData: FormData) {
  await requireCsrfFormData(formData);

  const session = await auth();
  const userId = session?.user?.id;
  const businessId = String(formData.get("businessId") ?? "");
  const packId = String(formData.get("packId") ?? "");

  if (!userId) {
    redirect(`/sign-in?callbackUrl=/dashboard/${businessId}/settings/billing`);
  }

  await requireRole({ businessId, userId, allowedRoles: [StaffRole.MANAGER] });

  try {
    await purchaseReachPackWithCredit({ businessId, packId });
  } catch (error) {
    if (error instanceof ReachPackError) {
      redirect(`/dashboard/${businessId}/settings/billing?reachpack=error&msg=${encodeURIComponent(error.message)}`);
    }
    throw error;
  }

  redirect(`/dashboard/${businessId}/settings/billing?reachpack=success`);
}
