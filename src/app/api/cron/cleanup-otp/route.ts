import { NextResponse } from "next/server";

import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { constantTimeEqual } from "@/lib/security";

const STALE_OTP_HOURS = 24;
const STALE_WEBHOOK_DAYS = 30;

function isAuthorized(request: Request): boolean {
  const provided =
    request.headers.get("x-cron-secret") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const expected = process.env.CRON_SECRET;

  if (!provided || !expected) return false;
  return constantTimeEqual(provided, expected);
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cutoffOtp = new Date(Date.now() - STALE_OTP_HOURS * 60 * 60 * 1000);
  const cutoffWebhook = new Date(Date.now() - STALE_WEBHOOK_DAYS * 24 * 60 * 60 * 1000);

  const [otp, consents] = await Promise.all([
    prisma.otpCode.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: cutoffOtp } },
          { consumedAt: { not: null, lt: cutoffOtp } }
        ]
      }
    }),
    // Revoked consents older than the webhook retention window get hard-purged
    // so that exporting the data subject's record reflects current consent state.
    prisma.userConsent.deleteMany({
      where: {
        revokedAt: { not: null, lt: cutoffWebhook }
      }
    })
  ]);

  logger.info(
    { otp: otp.count, consents: consents.count },
    "cron.cleanup_otp.completed"
  );

  return NextResponse.json({
    ok: true,
    deletedOtps: otp.count,
    deletedConsents: consents.count,
    timestamp: new Date().toISOString()
  });
}
