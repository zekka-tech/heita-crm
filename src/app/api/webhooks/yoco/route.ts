import crypto from "node:crypto";

import { type NextRequest, NextResponse } from "next/server";

import { logger } from "@/lib/logger";
import { constantTimeEqual } from "@/lib/security";
import { handleYocoWebhook } from "@/server/services/billing.service";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const secret = process.env.YOCO_WEBHOOK_SECRET;
  if (!secret) {
    logger.error({}, "yoco.webhook.no_secret");
    return NextResponse.json({ error: "Webhook secret not configured." }, { status: 500 });
  }

  const rawBody = await request.text();
  const signature = request.headers.get("x-yoco-signature") ?? undefined;
  const timestampHeader = request.headers.get("x-yoco-timestamp");

  if (!signature) {
    return NextResponse.json({ error: "Missing signature." }, { status: 401 });
  }

  // Reject replayed webhooks: timestamp must be within 5 minutes of now
  if (timestampHeader !== null) {
    const ts = Number(timestampHeader);
    if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 300) {
      logger.warn({ timestamp: timestampHeader }, "yoco.webhook.replay_detected");
      return NextResponse.json({ error: "Request timestamp out of range." }, { status: 401 });
    }
  }

  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");

  if (!constantTimeEqual(signature, expected)) {
    logger.warn({}, "yoco.webhook.invalid_signature");
    return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  }

  let payload: { type: string; payload: Record<string, unknown> };
  try {
    payload = JSON.parse(rawBody) as { type: string; payload: Record<string, unknown> };
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  try {
    await handleYocoWebhook(payload as Parameters<typeof handleYocoWebhook>[0]);
    return NextResponse.json({ received: true });
  } catch (err) {
    logger.error({ err, type: payload.type }, "yoco.webhook.handler_error");
    return NextResponse.json({ error: "Internal error." }, { status: 500 });
  }
}
