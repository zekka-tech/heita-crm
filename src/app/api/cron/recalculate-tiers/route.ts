import { NextResponse } from "next/server";

import { logger } from "@/lib/logger";
import { constantTimeEqual } from "@/lib/security";
import { recalculateMembershipTiers } from "@/server/services/loyalty.service";

export const dynamic = "force-dynamic";

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

  const result = await recalculateMembershipTiers();
  logger.info(result, "cron.recalculate_tiers.completed");
  return NextResponse.json({ ok: true, job: "recalculate-tiers", result });
}
