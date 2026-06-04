import { NextRequest, NextResponse } from "next/server";

import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const WEBHOOK_SECRET = process.env.EMAIL_WEBHOOK_SECRET;

type ResendEvent = {
  type: string;
  data: {
    email_id: string;
    to: string[];
    created_at: string;
  };
};

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (WEBHOOK_SECRET) {
    const header = request.headers.get("svix-id");
    if (!header) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const payload = await request.json().catch(() => null);
  if (!payload?.type) {
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
