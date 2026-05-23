import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { exportAccountData } from "@/server/services/account.service";
import { enforceRateLimit, rateLimitHeaders } from "@/lib/rate-limit";

const EXPORT_WINDOW_SECONDS = 30 * 24 * 60 * 60;

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const limit = await enforceRateLimit({
    identifier: `account-export:${session.user.id}`,
    windowSeconds: EXPORT_WINDOW_SECONDS,
    max: 1
  });

  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Account exports are limited to one request every 30 days." },
      { status: 429, headers: rateLimitHeaders(limit) }
    );
  }

  const payload = await exportAccountData(session.user.id);

  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": 'attachment; filename="heita-account-export.json"',
      ...rateLimitHeaders(limit)
    }
  });
}
