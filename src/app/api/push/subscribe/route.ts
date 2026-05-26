import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { logger } from "@/lib/logger";
import {
  handlePushSubscribe,
  handlePushUnsubscribe
} from "@/server/http/push-subscribe-handler";

export const dynamic = "force-dynamic";

/**
 * POST /api/push/subscribe
 * Register a Web Push subscription for the authenticated user.
 * Auth and CSRF are validated inside the shared handler.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const response = await handlePushSubscribe(request);
    return response as NextResponse;
  } catch (err) {
    logger.error({ err }, "push.subscribe.error");
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}

/**
 * DELETE /api/push/subscribe
 * Remove a Web Push subscription for the authenticated user.
 * Auth and CSRF are validated inside the shared handler.
 */
export async function DELETE(request: NextRequest): Promise<NextResponse> {
  try {
    const response = await handlePushUnsubscribe(request);
    return response as NextResponse;
  } catch (err) {
    logger.error({ err }, "push.unsubscribe.error");
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
