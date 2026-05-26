import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { csrfFailureResponse } from "@/lib/csrf";
import { logger } from "@/lib/logger";
import {
  softDeleteAccount,
  updateAccountProfile
} from "@/server/services/account.service";

export const dynamic = "force-dynamic";

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

  let body: {
    name?: string | null;
    email?: string | null;
    preferredAiMode?: string | null;
    notificationPreferences?: unknown;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  try {
    const updated = await updateAccountProfile({
      userId,
      name: body.name,
      email: body.email,
      preferredAiMode: body.preferredAiMode,
      notificationPreferences: body.notificationPreferences as
        | import("@/lib/notification-preferences").NotificationPreferences
        | null
        | undefined
    });

    return NextResponse.json(updated);
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
