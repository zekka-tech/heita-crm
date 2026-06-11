import { createHmac, timingSafeEqual } from "crypto";
import { MessageChannel, MessageStatus, SalesThreadStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { markCustomerResponded } from "@/server/services/sales-thread.service";

type ResendAddress = string | { email?: string | null; name?: string | null };

type ResendEvent = {
  type: string;
  data: {
    email_id?: string;
    message_id?: string;
    from?: ResendAddress;
    to?: ResendAddress[];
    cc?: ResendAddress[];
    subject?: string;
    text?: string;
    html?: string;
    headers?: Record<string, string | string[] | undefined> | { name?: string; value?: string }[];
    created_at?: string;
  };
};

const INBOUND_EMAIL_EVENT_TYPES = new Set([
  "email.received",
  "email.inbound",
  "email.replied",
  "email.reply_received"
]);

/**
 * Verify a Svix-signed webhook request using only Node.js crypto.
 * Protocol: HMAC-SHA256 over "{svix-id}.{svix-timestamp}.{raw-body}" with the
 * base64-decoded signing secret. Signature header format: "v1,{base64}[,...]".
 */
async function verifySvixSignature(
  request: NextRequest,
  rawBody: string
): Promise<boolean> {
  const msgId = request.headers.get("svix-id");
  const msgTimestamp = request.headers.get("svix-timestamp");
  const msgSignature = request.headers.get("svix-signature");

  if (!msgId || !msgTimestamp || !msgSignature) return false;

  const tsSeconds = Number(msgTimestamp);
  if (isNaN(tsSeconds)) return false;
  const ageSeconds = Math.abs(Date.now() / 1000 - tsSeconds);
  if (ageSeconds > 300) return false;

  const signingInput = `${msgId}.${msgTimestamp}.${rawBody}`;
  const secretBytes = Buffer.from(process.env.EMAIL_WEBHOOK_SECRET!, "base64");
  const computed = createHmac("sha256", secretBytes)
    .update(signingInput)
    .digest("base64");
  const expectedBuf = Buffer.from(`v1,${computed}`);

  return msgSignature.split(" ").some((sig) => {
    try {
      const sigBuf = Buffer.from(sig);
      return (
        sigBuf.length === expectedBuf.length &&
        timingSafeEqual(sigBuf, expectedBuf)
      );
    } catch {
      return false;
    }
  });
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function emailFromAddress(address: ResendAddress | null | undefined) {
  if (!address) return null;
  if (typeof address === "object") return address.email ? normalizeEmail(address.email) : null;
  const match = address.match(/<([^>]+)>/);
  return normalizeEmail(match?.[1] ?? address);
}

function emailsFromAddresses(addresses: ResendAddress[] | null | undefined) {
  return [...new Set((addresses ?? []).map(emailFromAddress).filter((email): email is string => Boolean(email)))];
}

function getInboundHeader(headers: ResendEvent["data"]["headers"], name: string) {
  const wanted = name.toLowerCase();
  if (Array.isArray(headers)) {
    const header = headers.find((item) => item.name?.toLowerCase() === wanted);
    return header?.value?.trim() || null;
  }
  if (!headers || typeof headers !== "object") return null;
  const foundKey = Object.keys(headers).find((key) => key.toLowerCase() === wanted);
  if (!foundKey) return null;
  const value = headers[foundKey];
  return Array.isArray(value) ? (value[0]?.trim() || null) : (value?.trim() || null);
}

function plainTextFromEmail(data: ResendEvent["data"]) {
  const text = data.text?.trim();
  if (text) return text;
  const html = data.html?.replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (html) return html;
  return data.subject?.trim() || "Email reply received.";
}

async function resolveBusinessIdsForInboundEmail(recipientEmails: string[]) {
  if (!recipientEmails.length) return [];
  const mapped = await prisma.businessInboundAddress.findMany({
    where: {
      channel: MessageChannel.EMAIL,
      provider: "resend",
      address: { in: recipientEmails },
      isActive: true
    },
    select: { businessId: true }
  });

  const businesses = await prisma.business.findMany({
    where: {
      OR: recipientEmails.map((email) => ({ email: { equals: email, mode: "insensitive" as const } }))
    },
    select: { id: true }
  });

  return [...new Set([...mapped.map((item) => item.businessId), ...businesses.map((item) => item.id)])];
}

async function handleInboundEmail(event: ResendEvent) {
  const fromEmail = emailFromAddress(event.data.from);
  if (!fromEmail) {
    logger.info({ emailId: event.data.email_id }, "email.inbound_missing_from");
    return;
  }

  const user = await prisma.user.findFirst({
    where: { email: fromEmail, deletedAt: null },
    select: { id: true, email: true }
  });
  if (!user) {
    logger.info({ fromEmail }, "email.inbound_unknown_sender");
    return;
  }

  const threadId = getInboundHeader(event.data.headers, "x-heita-sales-thread-id");
  const businessId = getInboundHeader(event.data.headers, "x-heita-business-id");
  const userThreadWhere = {
    OR: [
      { userId: user.id },
      { membership: { userId: user.id } }
    ]
  };

  const thread = threadId
    ? await prisma.salesThread.findFirst({
        where: {
          id: threadId,
          ...(businessId ? { businessId } : {}),
          status: SalesThreadStatus.OPEN,
          ...userThreadWhere
        },
        select: { id: true, businessId: true, contactPhone: true }
      })
    : null;

  const fallbackThread = thread ?? await (async () => {
    const recipientEmails = emailsFromAddresses([...(event.data.to ?? []), ...(event.data.cc ?? [])]);
    const businessIds = await resolveBusinessIdsForInboundEmail(recipientEmails);
    if (!businessIds.length) return null;
    return prisma.salesThread.findFirst({
      where: {
        businessId: { in: businessIds },
        status: SalesThreadStatus.OPEN,
        ...userThreadWhere
      },
      orderBy: { updatedAt: "desc" },
      select: { id: true, businessId: true, contactPhone: true }
    });
  })();

  if (!fallbackThread) {
    logger.info({ fromEmail, emailId: event.data.email_id }, "email.inbound_no_open_sales_thread");
    return;
  }

  const externalId = event.data.email_id ?? event.data.message_id ?? null;
  const existing = externalId
    ? await prisma.message.findFirst({ where: { channel: MessageChannel.EMAIL, externalId }, select: { id: true } })
    : null;
  if (existing) return;

  const message = await prisma.message.create({
    data: {
      businessId: fallbackThread.businessId,
      userId: user.id,
      contactPhone: fallbackThread.contactPhone,
      channel: MessageChannel.EMAIL,
      direction: "INBOUND",
      externalId,
      status: MessageStatus.RECEIVED,
      body: plainTextFromEmail(event.data).slice(0, 10_000),
      salesThreadId: fallbackThread.id,
      metadata: {
        fromEmail,
        toEmails: emailsFromAddresses(event.data.to),
        ccEmails: emailsFromAddresses(event.data.cc),
        subject: event.data.subject ?? null,
        provider: "resend"
      }
    }
  });

  await markCustomerResponded({
    businessId: fallbackThread.businessId,
    threadId: fallbackThread.id,
    messageId: message.id,
    at: message.createdAt
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const rawBody = await request.text().catch(() => null);
  if (rawBody === null) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  if (process.env.EMAIL_WEBHOOK_SECRET) {
    const verified = await verifySvixSignature(request, rawBody);
    if (!verified) {
      logger.warn("email.webhook_signature_invalid");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (
    !payload ||
    typeof payload !== "object" ||
    !("type" in payload) ||
    typeof (payload as Record<string, unknown>).type !== "string"
  ) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const event = payload as ResendEvent;

  try {
    if (INBOUND_EMAIL_EVENT_TYPES.has(event.type)) {
      await handleInboundEmail(event);
      return NextResponse.json({ received: true });
    }

    for (const email of emailsFromAddresses(event.data.to)) {
      const user = await prisma.user.findFirst({
        where: { email, deletedAt: null },
        select: { id: true }
      });

      if (!user) continue;

      switch (event.type) {
        case "email.complained": {
          await prisma.userConsent.updateMany({
            where: {
              userId: user.id,
              type: "EMAIL_MARKETING",
              revokedAt: null
            },
            data: { revokedAt: new Date() }
          });
          logger.warn(
            { userId: user.id, email },
            "email.complaint_consent_revoked"
          );
          break;
        }
        case "email.bounced": {
          logger.warn(
            { userId: user.id, email, emailId: event.data.email_id },
            "email.bounced"
          );
          break;
        }
        case "email.delivered": {
          break;
        }
        default: {
          logger.info({ type: event.type, email }, "email.webhook_unhandled_type");
        }
      }
    }
  } catch (error) {
    logger.error({ err: error }, "email.webhook_handler_error");
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
