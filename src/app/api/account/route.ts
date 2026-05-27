import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { csrfFailureResponse } from "@/lib/csrf";
import { logger } from "@/lib/logger";
import { NotificationPreferencesSchema } from "@/lib/notification-preferences";
import {
  softDeleteAccount,
  updateAccountProfile
} from "@/server/services/account.service";

export const dynamic = "force-dynamic";

const UpdateAccountSchema = z.object({
  name: z.string().trim().min(1).max(100).nullable().optional(),
  email: z.string().trim().email().nullable().optional(),
  preferredAiMode: z.string().trim().min(1).max(50).nullable().optional(),
  notificationPreferences: NotificationPreferencesSchema.nullable().optional()
});

/**
 * PATCH /api/account
 * Update the authenticated user's profile fields.
 * Accepts: { name?, email?, preferredAiMode?, notificationPreferences? }
 */
export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const csrfFailure = await csrfFailureResponse(request);
  if (csrfFailure) {
    return csrfFailure as NextResponse;
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = UpdateAccountSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid account update." }, { status: 400 });
  }

  try {
    const updated = await updateAccountProfile({
      userId,
      name: parsed.data.name ?? undefined,
      email: parsed.data.email ?? undefined,
      preferredAiMode: parsed.data.preferredAiMode ?? undefined,
      notificationPreferences: parsed.data.notificationPreferences ?? undefined
    });

    return NextResponse.json({ ok: true, user: { id: updated.id, name: updated.name, email: updated.email } });
  } catch (err) {
    logger.error({ err }, "account.patch.error");
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}

/**
 * DELETE /api/account
 * Soft-delete the authenticated user's account.
 */
export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const csrfFailure = await csrfFailureResponse(request);
  if (csrfFailure) {
    return csrfFailure as NextResponse;
  }

  try {
    await softDeleteAccount(userId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "account.delete.error");
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
