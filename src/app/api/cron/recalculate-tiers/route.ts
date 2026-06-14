import { NextResponse } from "next/server";

import { logger } from "@/lib/logger";
import { getRedis } from "@/lib/redis";
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

async function isAlreadyRunning(): Promise<boolean> {
  const redis = getRedis();
  // Fail-closed: if Redis is unavailable we cannot guarantee idempotency, so
  // treat as already-running to prevent duplicate concurrent tier recalculations
  // (audit finding 11). The cron will retry on the next scheduled firing.
  if (!redis) return true;
  // Hour-scoped key: only one run per hour regardless of concurrent cron firings.
  const key = `cron:recalculate-tiers:${new Date().toISOString().slice(0, 13)}`;
  const set = await redis.set(key, "1", "EX", 7200, "NX");
  return set === null; // null means key already existed
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (await isAlreadyRunning()) {
    return NextResponse.json({ ok: true, cached: true });
  }

  const result = await recalculateMembershipTiers();
  logger.info(result, "cron.recalculate_tiers.completed");
  return NextResponse.json({ ok: true, job: "recalculate-tiers", result });
}
