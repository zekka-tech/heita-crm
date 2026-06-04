import { createHmac, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";

import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

type ResendEvent = {
  type: string;
  data: {
    email_id: string;
    to: string[];
    created_at: string;
  };
};

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
    for (const email of event.data.to) {
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
