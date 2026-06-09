"use server";

import type { Route } from "next";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { requireCsrfFormData } from "@/lib/csrf";
import { updateBusinessWhatsApp } from "@/server/services/business.service";

function isNextRedirectError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.message.startsWith("NEXT_REDIRECT") ||
      Boolean((error as { digest?: string }).digest?.startsWith("NEXT_REDIRECT")))
  );
}

export async function connectWhatsAppAction(formData: FormData) {
  await requireCsrfFormData(formData);

  const session = await auth();
  const userId = session?.user?.id;
  const businessId = String(formData.get("businessId") ?? "");

  if (!userId) {
    redirect(`/sign-in?callbackUrl=/dashboard/${businessId}/settings/integrations`);
  }

  const base = `/dashboard/${businessId}/settings/integrations`;

  try {
    await updateBusinessWhatsApp({
      businessId,
      actorUserId: userId,
      wabaPhoneId: String(formData.get("wabaPhoneId") ?? ""),
      whatsappPhoneNumber: String(formData.get("whatsappPhoneNumber") ?? "")
    });
  } catch (error) {
    if (isNextRedirectError(error)) {
      throw error;
    }
    const message =
      error instanceof Error ? error.message : "Could not save WhatsApp settings.";
    redirect(`${base}?whatsapp=error&reason=${encodeURIComponent(message)}` as Route);
  }

  redirect(`${base}?whatsapp=saved` as Route);
}
