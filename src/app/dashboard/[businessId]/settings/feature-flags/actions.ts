"use server";

import type { Route } from "next";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { requireCsrfFormData } from "@/lib/csrf";
import { setBusinessFeatureFlag } from "@/server/services/feature-flag.service";

function isNextRedirectError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.message.startsWith("NEXT_REDIRECT") ||
      Boolean((error as { digest?: string }).digest?.startsWith("NEXT_REDIRECT")))
  );
}

export async function updateFeatureFlagAction(formData: FormData) {
  await requireCsrfFormData(formData);

  const businessId = String(formData.get("businessId") ?? "");
  const key = String(formData.get("key") ?? "");
  const isEnabled = formData.get("isEnabled") === "on";
  const session = await auth();

  if (!session?.user?.id) {
    redirect(`/sign-in?callbackUrl=/dashboard/${businessId}/settings/feature-flags`);
  }

  const base = `/dashboard/${businessId}/settings/feature-flags`;
  try {
    await setBusinessFeatureFlag({
      businessId,
      actorUserId: session.user.id,
      key,
      isEnabled
    });
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    const message = error instanceof Error ? error.message : "Could not update feature flag.";
    redirect(`${base}?updated=error&reason=${encodeURIComponent(message)}` as Route);
  }

  redirect(`${base}?updated=1` as Route);
}
