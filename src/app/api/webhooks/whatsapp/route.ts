import { NextResponse } from "next/server";

import { logger } from "@/lib/logger";
import { constantTimeEqual, verifyMetaWhatsappSignature } from "@/lib/security";
import { handleWhatsappInboundPayload } from "@/server/services/whatsapp.service";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");
  const expected = process.env.WHATSAPP_VERIFY_TOKEN;

  if (mode !== "subscribe" || !token || !expected) {
    return NextResponse.json({ error: "Verification failed" }, { status: 403 });
  }

  if (!constantTimeEqual(token, expected)) {
    return NextResponse.json({ error: "Verification failed" }, { status: 403 });
  }

  return new NextResponse(challenge ?? "", { status: 200 });
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  const signatureHeader = request.headers.get("x-hub-signature-256");

  if (!appSecret) {
    logger.error("whatsapp.webhook.misconfigured: missing WHATSAPP_APP_SECRET");
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const verified = verifyMetaWhatsappSignature({
    rawBody,
    signatureHeader,
    appSecret
  });

  if (!verified) {
    logger.warn({ signature: signatureHeader }, "whatsapp.webhook.invalid_signature");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Always return 200 within Meta's 20s SLA; queue heavy work.
  void handleWhatsappInboundPayload(payload).catch((error) => {
    logger.error({ err: error }, "whatsapp.webhook.handler_failed");
  });

  return NextResponse.json({ received: true });
}
