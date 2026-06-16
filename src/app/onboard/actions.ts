"use server";

import { BusinessCategory, Province } from "@prisma/client";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { requireCsrfFormData } from "@/lib/csrf";
import { enforceRateLimit } from "@/lib/rate-limit";
import { captureEvent } from "@/lib/telemetry";
import { buildLeadAttribution, TELEMETRY_EVENTS } from "@/lib/telemetry-events";
import {
  createBusinessWithDefaults,
  uploadBusinessLogo
} from "@/server/services/business.service";
import { captureMerchantReferral } from "@/server/services/merchant-referral.service";

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
  const attribution = buildLeadAttribution({
    source: String(formData.get("utmSource") ?? ""),
    medium: String(formData.get("utmMedium") ?? ""),
    campaign: String(formData.get("utmCampaign") ?? "")
  });

  if (!name) {
    throw new Error("Business name is required.");
  }

  if (!Object.values(BusinessCategory).includes(category)) {
    throw new Error("Choose a valid business category.");
  }

  if (!Object.values(Province).includes(province)) {
    throw new Error("Choose a valid province.");
  }

  const logo = formData.get("logo");
  const logoUrl =
    logo instanceof File && logo.size > 0 ? await uploadBusinessLogo(logo) : null;

  let business;
  try {
    business = await createBusinessWithDefaults({
      userId,
      name,
      description,
      category,
      province,
      phone,
      email,
      logoUrl,
      loyaltySignupBonus: Number.isFinite(loyaltySignupBonus) ? loyaltySignupBonus : 100,
      attribution
    });
  } catch (error) {
    captureEvent({
      userId,
      event: TELEMETRY_EVENTS.onboardingError,
      properties: {
        error: error instanceof Error ? error.message : String(error)
      }
    });
    throw error;
  }

  // Record a B2B merchant referral if this business onboarded via a code.
  // Best-effort: never block onboarding on a referral-capture failure.
  const merchantReferralCode = String(formData.get("merchantReferralCode") ?? "").trim();
  if (merchantReferralCode) {
    try {
      await captureMerchantReferral({
        codeValue: merchantReferralCode,
        referredBusinessId: business.id
      });
    } catch {
      // swallow — attribution is non-critical to onboarding success
    }
  }

  captureEvent({
    userId,
    event: TELEMETRY_EVENTS.onboardingCompleted,
    properties: {
      businessName: name,
      category,
      province,
      hasPhone: Boolean(phone),
      hasEmail: Boolean(email)
    }
  });

  redirect(`/dashboard/${business.id}`);
}
