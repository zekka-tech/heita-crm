"use server";

import { AiProvider } from "@prisma/client";
import type { Route } from "next";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { requireCsrfFormData } from "@/lib/csrf";
import { captureEvent } from "@/lib/telemetry";
import { TELEMETRY_EVENTS } from "@/lib/telemetry-events";
import {
  createProviderConnection,
  deleteProviderConnection,
  setActiveProviderConnection,
  validateProviderConnection
} from "@/server/services/ai-provider.service";

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
    redirect(`/sign-in?callbackUrl=/dashboard/${businessId}/settings/ai-models`);
  }
  return userId;
}

function settingsBase(businessId: string) {
  return `/dashboard/${businessId}/settings/ai-models`;
}

function parseProvider(value: string): AiProvider {
  if ((Object.values(AiProvider) as string[]).includes(value)) {
    return value as AiProvider;
  }
  throw new Error("Unknown provider.");
}

export async function addProviderConnectionAction(formData: FormData) {
  await requireCsrfFormData(formData);

  const session = await auth();
  const businessId = String(formData.get("businessId") ?? "");
  const userId = requireUser(session, businessId);
  const base = settingsBase(businessId);

  const provider = parseProvider(String(formData.get("provider") ?? ""));
  const chatModel = String(formData.get("chatModel") ?? "");

  let connectionId: string | null = null;
  try {
    const connection = await createProviderConnection({
      businessId,
      userId,
      provider,
      apiKey: String(formData.get("apiKey") ?? ""),
      chatModel,
      label: String(formData.get("label") ?? ""),
      baseUrl: String(formData.get("baseUrl") ?? "")
    });
    connectionId = connection.id;

    // AI activation milestone — fires once the connection is saved, regardless
    // of whether the subsequent key probe succeeds.
    captureEvent({
      userId,
      event: TELEMETRY_EVENTS.providerSelected,
      properties: { businessId, provider, model: chatModel || undefined }
    });

    // Validate immediately so the user gets instant feedback on the key.
    await validateProviderConnection({ businessId, userId, connectionId });
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    if (connectionId) {
      // Key saved but the probe errored — surface as saved; status shows INVALID.
      redirect(`${base}?connection=saved` as Route);
    }
    const message =
      error instanceof Error ? error.message : "Could not save the provider connection.";
    redirect(`${base}?connection=error&reason=${encodeURIComponent(message)}` as Route);
  }

  redirect(`${base}?connection=saved` as Route);
}

export async function validateProviderConnectionAction(formData: FormData) {
  await requireCsrfFormData(formData);

  const session = await auth();
  const businessId = String(formData.get("businessId") ?? "");
  const userId = requireUser(session, businessId);
  const base = settingsBase(businessId);

  try {
    const connection = await validateProviderConnection({
      businessId,
      userId,
      connectionId: String(formData.get("connectionId") ?? "")
    });
    if (connection.status !== "ACTIVE") {
      redirect(
        `${base}?connection=error&reason=${encodeURIComponent(connection.lastError ?? "Validation failed.")}` as Route
      );
    }
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    const message = error instanceof Error ? error.message : "Validation failed.";
    redirect(`${base}?connection=error&reason=${encodeURIComponent(message)}` as Route);
  }

  redirect(`${base}?connection=validated` as Route);
}

export async function activateProviderConnectionAction(formData: FormData) {
  await requireCsrfFormData(formData);

  const session = await auth();
  const businessId = String(formData.get("businessId") ?? "");
  const userId = requireUser(session, businessId);
  const base = settingsBase(businessId);
  const rawConnectionId = String(formData.get("connectionId") ?? "");

  try {
    await setActiveProviderConnection({
      businessId,
      userId,
      connectionId: rawConnectionId || null
    });
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    const message = error instanceof Error ? error.message : "Could not update the AI brain.";
    redirect(`${base}?connection=error&reason=${encodeURIComponent(message)}` as Route);
  }

  redirect(`${base}?connection=${rawConnectionId ? "activated" : "deactivated"}` as Route);
}

export async function deleteProviderConnectionAction(formData: FormData) {
  await requireCsrfFormData(formData);

  const session = await auth();
  const businessId = String(formData.get("businessId") ?? "");
  const userId = requireUser(session, businessId);
  const base = settingsBase(businessId);

  try {
    await deleteProviderConnection({
      businessId,
      userId,
      connectionId: String(formData.get("connectionId") ?? "")
    });
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    const message = error instanceof Error ? error.message : "Could not remove the connection.";
    redirect(`${base}?connection=error&reason=${encodeURIComponent(message)}` as Route);
  }

  redirect(`${base}?connection=removed` as Route);
}
