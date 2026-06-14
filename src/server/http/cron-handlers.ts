import { NextResponse } from "next/server";

import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { getRedis } from "@/lib/redis";
import { constantTimeEqual } from "@/lib/security";
import { withSpan } from "@/lib/tracing";
import { sendDueEventReminders } from "@/server/services/events.service";
import { expireEligiblePoints, sendPointsExpiryWarnings } from "@/server/services/loyalty.service";

const STALE_OTP_HOURS = 24;
const STALE_WEBHOOK_DAYS = 30;
const HARD_DELETE_DAYS = 30;
// POPIA: privacy policy states WhatsApp messages are deleted after 30 days
const WHATSAPP_MESSAGE_RETENTION_DAYS = 30;
// POPIA: in-app (Connect) messages retained for 180 days by default;
// override per-deployment via CONNECT_MESSAGE_RETENTION_DAYS env var.
const CONNECT_MESSAGE_RETENTION_DAYS = parseInt(
  process.env.CONNECT_MESSAGE_RETENTION_DAYS ?? "180",
  10
);
const HARD_DELETE_BATCH = 100;

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

  return withSpan("cron.cleanup_otp", { job: "cleanup-otp" }, async () => {
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

  return withSpan("cron.expire_points", { job: "expire-points" }, async () => {
    const result = await expireEligiblePoints();
    return NextResponse.json({ ok: true, job: "expire-points", result });
  });
}

export async function handleSendExpiryWarningsCron(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const idempKey = `cron:expiry-warnings:${new Date().toISOString().slice(0, 13)}`;
  if (await checkIdempotency(idempKey, 7200)) {
    return NextResponse.json({ ok: true, cached: true });
  }

  return withSpan("cron.send_expiry_warnings", { job: "expiry-warnings" }, async () => {
    const result = await sendPointsExpiryWarnings(7, new Date());
    logger.info(result, "cron.expiry_warnings.completed");
    return NextResponse.json({ ok: true, job: "expiry-warnings", result });
  });
}

export async function handleSendRemindersCron(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const idempKey = `cron:send-reminders:${new Date().toISOString().slice(0, 13)}`;
  if (await checkIdempotency(idempKey, 7200)) {
    return NextResponse.json({ ok: true, cached: true });
  }

  return withSpan("cron.send_reminders", { job: "send-reminders" }, async () => {
    const result = await sendDueEventReminders();
    logger.info(result, "cron.send_reminders.completed");
    return NextResponse.json({ ok: true, job: "send-reminders", result });
  });
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

  let deleted = 0;
  let cursor: string | undefined;

  // Cursor-paginated to avoid loading all expired users into memory at once
  do {
    const batch = await prisma.user.findMany({
      where: { deletedAt: { lt: cutoff } },
      select: { id: true },
      take: HARD_DELETE_BATCH,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {})
    });

    if (batch.length === 0) break;

    for (const { id: userId } of batch) {
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

            await tx.user.delete({ where: { id: userId } });
          },
          { maxWait: 10_000, timeout: 30_000 }
        );
        deleted += 1;
      } catch (err) {
        logger.error({ userId, err }, "cron.hard_delete_users.row_error");
      }
    }

    cursor = batch[batch.length - 1]?.id;
  } while (true);

  logger.info({ deleted }, "cron.hard_delete_users.completed");

  return NextResponse.json({ ok: true, job: "hard-delete-users", deleted });
}

/**
 * Purge WhatsApp messages older than WHATSAPP_MESSAGE_RETENTION_DAYS.
 *
 * POPIA requires that personal data is not held longer than necessary.
 * Our privacy policy states WhatsApp message content is deleted after 30 days.
 * Cursor-paginated to avoid loading all rows into memory.
 */
export async function handlePurgeWhatsappMessagesCron(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const idempKey = `cron:purge-whatsapp:${new Date().toISOString().slice(0, 10)}`;
  if (await checkIdempotency(idempKey, 86_400)) {
    return NextResponse.json({ ok: true, cached: true });
  }

  const cutoff = new Date(
    Date.now() - WHATSAPP_MESSAGE_RETENTION_DAYS * 24 * 60 * 60 * 1000
  );

  let totalDeleted = 0;
  let cursor: string | undefined;

  do {
    const batch = await prisma.message.findMany({
      where: {
        channel: "WHATSAPP",
        createdAt: { lt: cutoff }
      },
      select: { id: true },
      take: HARD_DELETE_BATCH,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {})
    });

    if (batch.length === 0) break;

    const ids = batch.map((m) => m.id);
    const { count } = await prisma.message.deleteMany({ where: { id: { in: ids } } });
    totalDeleted += count;
    cursor = batch[batch.length - 1]?.id;
  } while (true);

  logger.info({ totalDeleted, cutoff }, "cron.purge_whatsapp_messages.completed");
  return NextResponse.json({ ok: true, job: "purge-whatsapp-messages", totalDeleted });
}

export async function handleBroadcastPromotionsCron(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const idempKey = `cron:broadcast-promotions:${new Date().toISOString().slice(0, 13)}`;
  if (await checkIdempotency(idempKey, 7200)) {
    return NextResponse.json({ ok: true, cached: true });
  }

  return withSpan("cron.broadcast_promotions", { job: "broadcast-promotions" }, async () => {
    const now = new Date();
    const due = await prisma.promotion.findMany({
      where: {
        isActive: true,
        broadcastAt: null,
        startsAt: { lte: now }
      },
      select: { id: true, businessId: true }
    });

    let succeeded = 0;
    let failed = 0;

    for (const promotion of due) {
      try {
        // Atomic claim: updateMany where broadcastAt IS NULL prevents double-send
        const claimed = await prisma.promotion.updateMany({
          where: { id: promotion.id, broadcastAt: null },
          data: { broadcastAt: now }
        });
        if (claimed.count === 0) {
          // Already broadcast by another concurrent invocation
          continue;
        }
        succeeded++;
      } catch (error) {
        failed++;
        logger.error({ err: error, promotionId: promotion.id }, "cron.broadcast_promotions.item_failed");
      }
    }

    logger.info({ total: due.length, succeeded, failed }, "cron.broadcast_promotions.completed");
    return NextResponse.json({ ok: true, job: "broadcast-promotions", total: due.length, succeeded, failed });
  });
}

export async function handlePurgeConnectMessagesCron(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const idempKey = `cron:purge-connect:${new Date().toISOString().slice(0, 10)}`;
  if (await checkIdempotency(idempKey, 86_400)) {
    return NextResponse.json({ ok: true, cached: true });
  }

  const cutoff = new Date(Date.now() - CONNECT_MESSAGE_RETENTION_DAYS * 24 * 60 * 60 * 1000);

  let totalDeleted = 0;
  let cursor: string | undefined;

  do {
    const batch = await prisma.message.findMany({
      where: { channel: "IN_APP", createdAt: { lt: cutoff } },
      select: { id: true },
      take: HARD_DELETE_BATCH,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {})
    });

    if (batch.length === 0) break;

    const ids = batch.map((m) => m.id);
    await prisma.message.deleteMany({ where: { id: { in: ids } } });
    totalDeleted += ids.length;
    cursor = ids[ids.length - 1];
  } while (true);

  logger.info(
    { totalDeleted, retentionDays: CONNECT_MESSAGE_RETENTION_DAYS },
    "cron.purge_connect_messages.completed"
  );
  return NextResponse.json({ ok: true, job: "purge-connect-messages", totalDeleted });
}
