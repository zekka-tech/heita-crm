import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { ConsentChannel, ConsentType } from "@prisma/client";

import { auth } from "@/lib/auth";
import { csrfFailureResponse } from "@/lib/csrf";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type CookieChoice = "accepted" | "rejected";

function isCookieChoice(value: unknown): value is CookieChoice {
  return value === "accepted" || value === "rejected";
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (
    typeof body !== "object" ||
    body === null ||
    !isCookieChoice((body as Record<string, unknown>).choice)
  ) {
    return NextResponse.json(
      { error: "Body must be { choice: 'accepted' | 'rejected' }." },
      { status: 400 }
    );
  }

  const choice = (body as { choice: CookieChoice }).choice;

  const session = await auth();
  const userId = session?.user?.id;

  // Only enforce CSRF for authenticated requests that will write to the DB.
  if (userId) {
    const csrfFailure = await csrfFailureResponse(request);
    if (csrfFailure) return csrfFailure as NextResponse;
  }

  // If there is no authenticated session we skip the DB write — the UI still
  // persists the choice to localStorage on the client.
  if (!userId) {
    return NextResponse.json({ ok: true, persisted: false });
  }

  try {
    await prisma.userConsent.create({
      data: {
        userId,
        type: ConsentType.COOKIE_PREFERENCES,
        channel: ConsentChannel.WEB,
        source: "cookie-banner",
        // Store the choice (accepted/rejected) as the source suffix so it's
        // queryable without adding an extra column.
        // We also record a revocation immediately for "rejected" choices.
        revokedAt: choice === "rejected" ? new Date() : null
      }
    });

    logger.info({ userId, choice }, "account.consent.cookie.recorded");
  } catch (err) {
    // Non-fatal — the client-side localStorage copy is the source of truth
    // for the banner UI. A DB write failure should never break the UX.
    logger.error({ userId, choice, err }, "account.consent.cookie.error");
  }

  return NextResponse.json({ ok: true, persisted: true });
}
