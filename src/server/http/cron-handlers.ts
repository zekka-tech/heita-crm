import { NextResponse } from "next/server";

import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { getRedis } from "@/lib/redis";
import { constantTimeEqual } from "@/lib/security";
import { sendDueEventReminders } from "@/server/services/events.service";
import { expireEligiblePoints } from "@/server/services/loyalty.service";

const STALE_OTP_HOURS = 24;
const STALE_WEBHOOK_DAYS = 30;
const HARD_DELETE_DAYS = 30;

function isAuthorized(request: Request): boolean {
  const provided =
    request.headers.get("x-cron-secret") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const expected = process.env.CRON_SECRET;

  if (!provided || !expected) return false;
  return constantTimeEqual(provided, expected);
}

async function checkIdempotency(key: string, ttlSeconds: number): Promise<boolean> {
  const redis = getRedis();
  if (!redis) {
    logger.warn({ key }, "cron.idempotency_check_skipped_no_redis");
    return false;
  }
  const existing = await redis.get(key);
  if (existing) return true;
  await redis.setex(key, ttlSeconds, "1");
  return false;
}

export async function handleCleanupOtpCron(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const idempKey = `cron:cleanup-otp:${new Date().toISOString().slice(0, 13)}`;
  if (await checkIdempotency(idempKey, 7200)) {
    return NextResponse.json({ ok: true, cached: true });
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

export async function handleExpirePointsCron(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const idempKey = `cron:expire-points:${new Date().toISOString().slice(0, 13)}`;
  if (await checkIdempotency(idempKey, 7200)) {
    return NextResponse.json({ ok: true, cached: true });
  }

  const result = await expireEligiblePoints();
  return NextResponse.json({ ok: true, job: "expire-points", result });
}

export async function handleSendRemindersCron(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const idempKey = `cron:send-reminders:${new Date().toISOString().slice(0, 13)}`;
  if (await checkIdempotency(idempKey, 7200)) {
    return NextResponse.json({ ok: true, cached: true });
  }

  const result = await sendDueEventReminders();
  logger.info(result, "cron.send_reminders.completed");
  return NextResponse.json({ ok: true, job: "send-reminders", result });
}

/**
 * Hard-delete User records whose `deletedAt` timestamp is older than 30 days.
 *
 * Soft-deleted accounts have their PII cleared immediately on deletion.
 * This cron purges the remaining anonymised skeleton records (and any
 * dangling related rows that were not cascade-deleted) so that no trace of
 * the account persists beyond the 30-day retention window.
 */
export async function handleHardDeleteExpiredUsers(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Daily idempotency — only run once per UTC day
  const idempKey = `cron:hard-delete-users:${new Date().toISOString().slice(0, 10)}`;
  if (await checkIdempotency(idempKey, 86_400)) {
    return NextResponse.json({ ok: true, cached: true });
  }

  const cutoff = new Date(Date.now() - HARD_DELETE_DAYS * 24 * 60 * 60 * 1000);

  const expiredUsers = await prisma.user.findMany({
    where: {
      deletedAt: { lt: cutoff }
    },
    select: { id: true }
  });

  let deleted = 0;

  for (const { id: userId } of expiredUsers) {
    try {
      await prisma.$transaction(
        async (tx) => {
          // Delete child rows first for tables that may not have cascade rules.
          await tx.otpCode.deleteMany({ where: { userId } });
          await tx.pushSubscription.deleteMany({ where: { userId } });
          await tx.userConsent.deleteMany({ where: { userId } });
          await tx.notification.deleteMany({ where: { userId } });

          // AiChatSession → AiChatMessage has Cascade on sessionId; deleting
          // sessions removes their messages automatically.
          await tx.aiChatSession.deleteMany({ where: { userId } });

          // Finally hard-delete the User skeleton.
          await tx.user.delete({ where: { id: userId } });
        },
        { maxWait: 10_000, timeout: 30_000 }
      );

      deleted += 1;
    } catch (err) {
      logger.error({ userId, err }, "cron.hard_delete_users.row_error");
    }
  }

  logger.info({ deleted, total: expiredUsers.length }, "cron.hard_delete_users.completed");

  return NextResponse.json({ ok: true, job: "hard-delete-users", deleted });
}
