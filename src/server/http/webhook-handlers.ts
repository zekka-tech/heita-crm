import crypto from "node:crypto";

import { MessageChannel, MessageStatus } from "@prisma/client";
import { NextResponse } from "next/server";

import { logger } from "@/lib/logger";
import { normalizeZaPhone } from "@/lib/phone";
import { prisma, withBusinessScope } from "@/lib/prisma";
import { incrementWebhookAuthFailure, observeHttpRoute } from "@/lib/metrics";
import { requestIdHeader, resolveRequestId } from "@/lib/request-context";
import {
  constantTimeEqual,
  getClientIp,
  isPrivateIp,
  isUnixTimestampWithinSkew,
  verifyMetaWhatsappSignature
} from "@/lib/security";
import { CircuitBreakerOpenError, runWithCircuitBreaker } from "@/lib/circuit-breaker";
import { handleWhatsappInboundPayload } from "@/server/services/whatsapp.service";
import { markCustomerResponded } from "@/server/services/sales-thread.service";

const AT_PRODUCTION_RANGES = ["196.201.214.", "196.201.213."];

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

function normalizeInboundAddress(value: string) {
  return value.trim().toLowerCase();
}

async function findBusinessForInboundSms(rawTo: string) {
  const trimmed = rawTo.trim();
  const normalizedPhone = normalizeZaPhone(trimmed);
  const addressCandidates = [...new Set([
    normalizeInboundAddress(trimmed),
    normalizedPhone ? normalizeInboundAddress(normalizedPhone) : null
  ].filter((value): value is string => Boolean(value)))];

  if (addressCandidates.length) {
    const mapped = await prisma.businessInboundAddress.findFirst({
      where: {
        channel: MessageChannel.SMS,
        provider: "africas-talking",
        address: { in: addressCandidates },
        isActive: true
      },
      select: { businessId: true }
    });
    if (mapped) return { id: mapped.businessId };
  }

  if (!normalizedPhone) return null;

  return prisma.business.findFirst({
    where: {
      OR: [
        { phone: normalizedPhone },
        { whatsappPhoneNumber: normalizedPhone }
      ]
    },
    select: { id: true }
  });
}

export async function handleWhatsappVerification(request: Request) {
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
    headers: { [requestIdHeader]: requestId }
  });
}

export async function handleWhatsappWebhook(request: Request) {
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
    incrementWebhookAuthFailure("whatsapp");
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

  const msgTimestamp = (payload as { entry?: { changes?: { value?: { messages?: { timestamp?: string | number }[] } }[] }[] } | undefined)
    ?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.timestamp;
  if (msgTimestamp !== undefined && !isUnixTimestampWithinSkew(Number(msgTimestamp), 300)) {
    logger.warn({ timestamp: msgTimestamp }, "whatsapp.webhook.replay_detected");
    observeHttpRoute({
      route: "/api/webhooks/whatsapp",
      method: "POST",
      status: 401,
      durationMs: Date.now() - startedAt
    });
    return NextResponse.json(
      { error: "Message timestamp outside acceptable window" },
      { status: 401, headers: { [requestIdHeader]: requestId } }
    );
  }

  void runWithCircuitBreaker("whatsapp-inbound", () =>
    handleWhatsappInboundPayload(payload)
  ).catch((error) => {
    if (error instanceof CircuitBreakerOpenError) {
      logger.warn(
        { circuit: error.circuit, retryAfterMs: error.retryAfterMs, requestId },
        "whatsapp.webhook.circuit_open_dropped"
      );
    } else {
      logger.error({ err: error, requestId }, "whatsapp.webhook.handler_failed");
    }
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

export async function handleAfricasTalkingWebhook(request: Request) {
  if (!isAllowedAtSource(request)) {
    logger.warn(
      { ip: getClientIp(request.headers) },
      "africas_talking.webhook.unauthorized"
    );
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rawBody = await request.text();

  const receivedHmac = request.headers.get("x-at-signature") ?? "";
  const expectedAt = crypto
    .createHmac("sha256", process.env.AT_WEBHOOK_SECRET ?? "")
    .update(rawBody)
    .digest("hex");
  if (!constantTimeEqual(expectedAt, receivedHmac)) {
    incrementWebhookAuthFailure("africas_talking");
    logger.warn({}, "africas_talking.webhook.invalid_hmac");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = new URLSearchParams(rawBody);
  const timestampRaw = params.get("timestamp");
  if (timestampRaw !== null) {
    const timestampMs = Number(timestampRaw);
    if (!Number.isFinite(timestampMs) || Math.abs(Date.now() - timestampMs) > 5 * 60 * 1000) {
      incrementWebhookAuthFailure("africas_talking");
      logger.warn({ timestamp: timestampRaw }, "africas_talking.webhook.replay_detected");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const direction = (params.get("direction") ?? params.get("type") ?? "").toLowerCase();
  const rawFrom = params.get("from") ?? params.get("phoneNumber") ?? params.get("msisdn");
  const rawTo = params.get("to") ?? params.get("linkId") ?? "";
  const body = params.get("text") ?? params.get("message") ?? "";
  const externalId = params.get("id") ?? params.get("messageId") ?? params.get("linkId") ?? null;

  if (rawFrom && body && (!direction || direction.includes("incoming") || direction.includes("inbound"))) {
    const fromPhone = normalizeZaPhone(rawFrom) ?? rawFrom;
    const rawToAddress = rawTo.trim();
    const toPhone = normalizeZaPhone(rawToAddress);
    const business = await findBusinessForInboundSms(rawToAddress);

    if (business) {
      const existingUser = await prisma.user.findFirst({ where: { phone: fromPhone }, select: { id: true } });
      const message = await withBusinessScope(business.id, async (tx) => {
        const existing = externalId
          ? await tx.message.findFirst({ where: { channel: MessageChannel.SMS, externalId }, select: { id: true } })
          : null;
        if (existing) return null;

        return tx.message.create({
          data: {
            businessId: business.id,
            userId: existingUser?.id ?? null,
            contactPhone: fromPhone,
            channel: MessageChannel.SMS,
            direction: "INBOUND",
            externalId,
            status: MessageStatus.RECEIVED,
            body,
            metadata: { fromPhone, toPhone, toAddress: rawToAddress }
          }
        });
      });
      if (message) {
        await markCustomerResponded({
          businessId: business.id,
          contactPhone: fromPhone,
          messageId: message.id,
          at: message.createdAt
        });
      }
    } else {
      logger.warn({ toAddress: rawToAddress, toPhone }, "africas_talking.webhook.unknown_business");
    }
  }

  logger.info({ size: rawBody.length }, "africas_talking.webhook.received");

  return NextResponse.json({ received: true });
}
