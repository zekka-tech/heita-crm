import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { enforceRateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { revokeAllSessions } from "@/server/services/session.service";

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const limit = await enforceRateLimit({
    identifier: `sign-out-all:${session.user.id}`,
    windowSeconds: 60,
    max: 3
  });
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Try again in a moment." },
      { status: 429, headers: rateLimitHeaders(limit) }
    );
  }

  const newVersion = await revokeAllSessions(session.user.id);
  logger.info({ userId: session.user.id, newVersion }, "auth.session.revoked_all");

  return NextResponse.json({ ok: true, sessionVersion: newVersion });
}
