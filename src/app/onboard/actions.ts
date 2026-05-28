"use server";

import { BusinessCategory, Province } from "@prisma/client";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { requireCsrfFormData } from "@/lib/csrf";
import { enforceRateLimit } from "@/lib/rate-limit";
import { createBusinessWithDefaults } from "@/server/services/business.service";

export async function createBusinessAction(formData: FormData) {
  await requireCsrfFormData(formData);

  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    redirect("/sign-in?callbackUrl=/onboard");
  }

  const rl = await enforceRateLimit({
    identifier: `onboard:create-business:${userId}`,
    windowSeconds: 3600,
    max: 5
  });
  if (!rl.allowed) {
    throw new Error("You've reached the maximum number of businesses. Try again later.");
  }

  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim() as BusinessCategory;
  const province = String(formData.get("province") ?? "").trim() as Province;
  const phone = String(formData.get("phone") ?? "").trim() || null;
  const email = String(formData.get("email") ?? "").trim() || null;
  const loyaltySignupBonus = Number(formData.get("loyaltySignupBonus") ?? 100);

  if (!name) {
    throw new Error("Business name is required.");
  }

  if (!Object.values(BusinessCategory).includes(category)) {
    throw new Error("Choose a valid business category.");
  }

  if (!Object.values(Province).includes(province)) {
    throw new Error("Choose a valid province.");
  }

  const business = await createBusinessWithDefaults({
    userId,
    name,
    description,
    category,
    province,
    phone,
    email,
    loyaltySignupBonus: Number.isFinite(loyaltySignupBonus) ? loyaltySignupBonus : 100
  });

  redirect(`/dashboard/${business.id}`);
}
