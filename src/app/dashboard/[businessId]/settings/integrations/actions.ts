"use server";

import { MessageChannel } from "@prisma/client";
import type { Route } from "next";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { requireCsrfFormData } from "@/lib/csrf";
import { updateBusinessWhatsApp } from "@/server/services/business.service";
import { deleteBusinessInboundAddress, upsertBusinessInboundAddress } from "@/server/services/inbound-address.service";

function isNextRedirectError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.message.startsWith("NEXT_REDIRECT") ||
      Boolean((error as { digest?: string }).digest?.startsWith("NEXT_REDIRECT")))
  );
}

function requireUser(session: { user?: { id?: string | null } } | null, businessId: string) {
  const userId = session?.user?.id;
  if (!userId) {
    redirect(`/sign-in?callbackUrl=/dashboard/${businessId}/settings/integrations`);
  }
  return userId;
}

export async function connectWhatsAppAction(formData: FormData) {
  await requireCsrfFormData(formData);

  const session = await auth();
  const businessId = String(formData.get("businessId") ?? "");
  const userId = requireUser(session, businessId);
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

export async function saveInboundAddressAction(formData: FormData) {
  await requireCsrfFormData(formData);

  const session = await auth();
  const businessId = String(formData.get("businessId") ?? "");
  const userId = requireUser(session, businessId);
  const base = `/dashboard/${businessId}/settings/integrations`;
  const channel = String(formData.get("channel") ?? "") as MessageChannel;

  try {
    await upsertBusinessInboundAddress({
      businessId,
      actorUserId: userId,
      channel,
      provider: String(formData.get("provider") ?? ""),
      address: String(formData.get("address") ?? ""),
      label: String(formData.get("label") ?? "")
    });
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    const message = error instanceof Error ? error.message : "Could not save inbound address.";
    redirect(`${base}?inbound=error&reason=${encodeURIComponent(message)}` as Route);
  }

  redirect(`${base}?inbound=saved` as Route);
}

export async function deleteInboundAddressAction(formData: FormData) {
  await requireCsrfFormData(formData);

  const session = await auth();
  const businessId = String(formData.get("businessId") ?? "");
  const userId = requireUser(session, businessId);
  const base = `/dashboard/${businessId}/settings/integrations`;

  try {
    await deleteBusinessInboundAddress({
      businessId,
      actorUserId: userId,
      addressId: String(formData.get("addressId") ?? "")
    });
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    const message = error instanceof Error ? error.message : "Could not remove inbound address.";
    redirect(`${base}?inbound=error&reason=${encodeURIComponent(message)}` as Route);
  }

  redirect(`${base}?inbound=removed` as Route);
}
