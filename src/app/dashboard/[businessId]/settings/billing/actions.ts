"use server";

import { StaffRole } from "@prisma/client";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { requireCsrfFormData } from "@/lib/csrf";
import { env } from "@/lib/env";
import { getReachPackSku } from "@/lib/reach-packs";
import { requireRole } from "@/lib/staff";
import { createYocoReachPackCheckout } from "@/server/services/payments/yoco";
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

export async function purchaseReachPackWithCardAction(formData: FormData) {
  await requireCsrfFormData(formData);

  const session = await auth();
  const userId = session?.user?.id;
  const businessId = String(formData.get("businessId") ?? "");
  const packId = String(formData.get("packId") ?? "");

  if (!userId) {
    redirect(`/sign-in?callbackUrl=/dashboard/${businessId}/settings/billing`);
  }

  await requireRole({ businessId, userId, allowedRoles: [StaffRole.MANAGER] });

  const sku = getReachPackSku(packId);
  if (!sku) {
    redirect(`/dashboard/${businessId}/settings/billing?reachpack=error&msg=${encodeURIComponent("Unknown reach-pack.")}`);
  }

  const returnUrl = `${env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? ""}/dashboard/${businessId}/settings/billing`;
  const checkout = await createYocoReachPackCheckout({
    businessId,
    packId: sku.id,
    priceZar: sku.priceZar,
    returnUrl
  });

  // External provider URL (Yoco-hosted checkout) — not an internal typed route.
  redirect(checkout.url as Parameters<typeof redirect>[0]);
}
