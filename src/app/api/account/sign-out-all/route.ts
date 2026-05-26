import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { csrfFailureResponse } from "@/lib/csrf";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
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
    // Incrementing sessionVersion invalidates all existing sessions.
    // The auth callback compares the JWT's sessionVersion against the DB value;
    // any mismatch causes the session to be treated as revoked.
    await prisma.user.update({
      where: { id: userId },
      data: { sessionVersion: { increment: 1 } }
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "account.sign_out_all.error");
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
