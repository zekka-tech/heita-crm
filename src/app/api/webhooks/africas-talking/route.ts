import { NextResponse } from "next/server";

import { logger } from "@/lib/logger";
import { constantTimeEqual, getClientIp, isPrivateIp } from "@/lib/security";

const AT_PRODUCTION_RANGES = [
  // Africa's Talking egress (documented in AT support portal; verify with current AT docs).
  "196.201.214.",
  "196.201.213."
];

function isAllowedAtSource(request: Request): boolean {
  const ip = getClientIp(request.headers);
  const sharedSecret = request.headers.get("x-at-shared-secret");
  const expected = process.env.AT_WEBHOOK_SECRET;

  if (process.env.NODE_ENV !== "production") {
    return true;
  }

  if (!expected || !sharedSecret || !constantTimeEqual(sharedSecret, expected)) {
    return false;
  }

  if (AT_PRODUCTION_RANGES.some((prefix) => ip.startsWith(prefix)) || isPrivateIp(ip)) {
    return true;
  }

  return false;
}

export async function POST(request: Request) {
  if (!isAllowedAtSource(request)) {
    logger.warn(
      { ip: getClientIp(request.headers) },
      "africas_talking.webhook.unauthorized"
    );
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.text();
  logger.info({ size: body.length }, "africas_talking.webhook.received");

  // TODO: parse delivery receipts / inbound SMS once handler is wired.

  return NextResponse.json({ received: true });
}
