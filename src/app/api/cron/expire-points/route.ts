import { NextResponse } from "next/server";

import { constantTimeEqual } from "@/lib/security";
import { expireEligiblePoints } from "@/server/services/loyalty.service";

function isAuthorized(request: Request): boolean {
  const provided =
    request.headers.get("x-cron-secret") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const expected = process.env.CRON_SECRET;

  if (!provided || !expected) return false;
  return constantTimeEqual(provided, expected);
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await expireEligiblePoints();

  return NextResponse.json({ ok: true, job: "expire-points", result });
}
