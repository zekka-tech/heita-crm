import { NextResponse } from "next/server";

import { logger } from "@/lib/logger";
import { observeHttpRoute } from "@/lib/metrics";
import { requestIdHeader, resolveRequestId } from "@/lib/request-context";
import { constantTimeEqual, verifyMetaWhatsappSignature } from "@/lib/security";
import { handleWhatsappInboundPayload } from "@/server/services/whatsapp.service";

export async function GET(request: Request) {
  const startedAt = Date.now();
  const requestId = resolveRequestId(request.headers);
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");
  const expected = process.env.WHATSAPP_VERIFY_TOKEN;

  if (mode !== "subscribe" || !token || !expected) {
    observeHttpRoute({
      route: "/api/webhooks/whatsapp",
      method: "GET",
      status: 403,
      durationMs: Date.now() - startedAt
    });
    return NextResponse.json(
      { error: "Verification failed" },
      { status: 403, headers: { [requestIdHeader]: requestId } }
    );
  }

  if (!constantTimeEqual(token, expected)) {
    observeHttpRoute({
      route: "/api/webhooks/whatsapp",
      method: "GET",
      status: 403,
      durationMs: Date.now() - startedAt
    });
    return NextResponse.json(
      { error: "Verification failed" },
      { status: 403, headers: { [requestIdHeader]: requestId } }
    );
  }

  observeHttpRoute({
    route: "/api/webhooks/whatsapp",
    method: "GET",
    status: 200,
    durationMs: Date.now() - startedAt
  });
  return new NextResponse(challenge ?? "", {
    status: 200,
    headers: {
      [requestIdHeader]: requestId
    }
  });
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  const requestId = resolveRequestId(request.headers);
  const rawBody = await request.text();
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  const signatureHeader = request.headers.get("x-hub-signature-256");

  if (!appSecret) {
    logger.error("whatsapp.webhook.misconfigured: missing WHATSAPP_APP_SECRET");
    observeHttpRoute({
      route: "/api/webhooks/whatsapp",
      method: "POST",
      status: 500,
      durationMs: Date.now() - startedAt
    });
    return NextResponse.json(
      { error: "Server misconfigured" },
      { status: 500, headers: { [requestIdHeader]: requestId } }
    );
  }

  const verified = verifyMetaWhatsappSignature({
    rawBody,
    signatureHeader,
    appSecret
  });

  if (!verified) {
    logger.warn({ signature: signatureHeader }, "whatsapp.webhook.invalid_signature");
    observeHttpRoute({
      route: "/api/webhooks/whatsapp",
      method: "POST",
      status: 401,
      durationMs: Date.now() - startedAt
    });
    return NextResponse.json(
      { error: "Invalid signature" },
      { status: 401, headers: { [requestIdHeader]: requestId } }
    );
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    observeHttpRoute({
      route: "/api/webhooks/whatsapp",
      method: "POST",
      status: 400,
      durationMs: Date.now() - startedAt
    });
    return NextResponse.json(
      { error: "Invalid JSON" },
      { status: 400, headers: { [requestIdHeader]: requestId } }
    );
  }

  // Always return 200 within Meta's 20s SLA; queue heavy work.
  void handleWhatsappInboundPayload(payload).catch((error) => {
    logger.error({ err: error, requestId }, "whatsapp.webhook.handler_failed");
  });

  observeHttpRoute({
    route: "/api/webhooks/whatsapp",
    method: "POST",
    status: 200,
    durationMs: Date.now() - startedAt
  });
  return NextResponse.json(
    { received: true },
    { headers: { [requestIdHeader]: requestId } }
  );
}
