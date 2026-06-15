import { createHmac, timingSafeEqual } from "node:crypto";

import { ConsentChannel, ConsentType, Prisma } from "@prisma/client";

import { sendEmail } from "@/lib/email";
import { logger } from "@/lib/logger";
import {
  normalizeNotificationPreferences,
  type NotificationPreferences
} from "@/lib/notification-preferences";
import { prisma, withSystemScope, withUserScope } from "@/lib/prisma";

export async function recordConsent(input: {
  userId: string;
  type: ConsentType;
  channel?: ConsentChannel;
  source: string;
  businessId?: string | null;
}) {
  return prisma.userConsent.create({
    data: {
      userId: input.userId,
      businessId: input.businessId ?? null,
      type: input.type,
      channel: input.channel ?? ConsentChannel.WEB,
      source: input.source
    }
  });
}

// Max rows per collection to prevent OOM on accounts with large history.
// Exports are capped at 10 000 rows per type; users needing full exports
// should contact support for a managed CSV dump.
const EXPORT_ROW_CAP = 10_000;

export async function exportAccountData(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      image: true,
      createdAt: true,
      updatedAt: true,
      notificationPreferences: true,
      // Expose only provider name — never access/refresh tokens
      accounts: { select: { provider: true, type: true } },
      pushSubscriptions: { select: { endpoint: true, createdAt: true } }
    }
  });

  const scoped = await withUserScope(userId, async (tx) => {
    const [memberships, loyaltyTransactions, messages, aiChatSessions] = await Promise.all([
      tx.membership.findMany({
        where: { userId },
        include: {
          business: true,
          tier: true
        },
        orderBy: { joinedAt: "asc" },
        take: EXPORT_ROW_CAP
      }),
      tx.loyaltyTransaction.findMany({
        where: {
          OR: [
            { userId },
            { membership: { userId } }
          ]
        },
        orderBy: { createdAt: "asc" },
        take: EXPORT_ROW_CAP
      }),
      tx.message.findMany({
        where: { userId },
        orderBy: { createdAt: "asc" },
        take: EXPORT_ROW_CAP
      }),
      tx.aiChatSession.findMany({
        where: { userId },
        select: {
          id: true,
          businessId: true,
          workspaceId: true,
          userId: true,
          title: true,
          createdAt: true,
          updatedAt: true
        },
        orderBy: { createdAt: "asc" },
        take: EXPORT_ROW_CAP
      })
    ]);

    return { memberships, loyaltyTransactions, messages, aiChatSessions };
  });

  const aiChatMessages = scoped.aiChatSessions.length > 0
    ? await prisma.aiChatMessage.findMany({
        where: { sessionId: { in: scoped.aiChatSessions.map((session) => session.id) } },
        orderBy: { createdAt: "asc" },
        take: EXPORT_ROW_CAP
      }).then((rows) => {
        const sessionsById = new Map(scoped.aiChatSessions.map((session) => [session.id, session]));
        return rows.map((row) => ({
          ...row,
          session: sessionsById.get(row.sessionId) ?? null
        }));
      })
    : [];

  const [notifications, consents] = await Promise.all([
    prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
      take: EXPORT_ROW_CAP
    }),
    prisma.userConsent.findMany({
      where: { userId },
      include: { business: true },
      orderBy: { grantedAt: "asc" }
    })
  ]);

  return {
    exportedAt: new Date().toISOString(),
    user,
    memberships: scoped.memberships,
    loyaltyTransactions: scoped.loyaltyTransactions,
    aiChatMessages,
    messages: scoped.messages,
    notifications,
    consents
  };
}

const ALLOWED_AI_MODES = ["ollama", "anthropic"] as const;

// --- Email verification helpers --------------------------------------------------

const EMAIL_VERIFY_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function emailVerifySecret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is not configured.");
  return s;
}

function signEmailToken(userId: string, newEmail: string, expiresAt: number): string {
  return createHmac("sha256", emailVerifySecret())
    .update(`${userId}:${newEmail}:${expiresAt}`)
    .digest("hex");
}

/** Queue a pending email-change and send a click-through verification link. */
export async function initiateEmailChange(userId: string, newEmail: string) {
  if (newEmail.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
    throw new Error("Provide a valid email address.");
  }

  const existing = await prisma.user.findFirst({
    where: { email: newEmail, NOT: { id: userId } },
    select: { id: true }
  });
  if (existing) {
    // Respond identically to avoid email enumeration.
    logger.warn({ userId }, "account.email.change.conflict");
    return;
  }

  const expiresAt = Date.now() + EMAIL_VERIFY_TTL_MS;
  const token = signEmailToken(userId, newEmail, expiresAt);

  await prisma.user.update({
    where: { id: userId },
    data: { pendingEmail: newEmail }
  });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const link = `${appUrl}/api/account/verify-email?userId=${encodeURIComponent(userId)}&email=${encodeURIComponent(newEmail)}&exp=${expiresAt}&token=${token}`;

  await sendEmail({
    to: newEmail,
    subject: "Verify your new Heita email address",
    text: `Click the link to verify your email address:\n\n${link}\n\nThis link expires in 24 hours.`,
    html: `<p>Click <a href="${link}">here</a> to verify your new email address.</p><p>This link expires in 24 hours.</p>`
  });

  logger.info({ userId }, "account.email.change.initiated");
}

/** Confirm a pending email change given a signed verification token. */
export async function confirmEmailChange(
  userId: string,
  newEmail: string,
  exp: number,
  token: string
) {
  if (Date.now() > exp) throw new Error("Verification link has expired.");

  const expected = signEmailToken(userId, newEmail, exp);
  const expectedBuf = Buffer.from(expected, "hex");
  const tokenBuf = Buffer.from(token.length === expected.length ? token : "x".repeat(expected.length), "hex");
  if (!timingSafeEqual(expectedBuf, tokenBuf)) {
    throw new Error("Invalid verification token.");
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, pendingEmail: true }
  });
  if (!user || user.pendingEmail !== newEmail) {
    throw new Error("No pending email change matches this link.");
  }

  await prisma.user.update({
    where: { id: userId },
    data: { email: newEmail, pendingEmail: null }
  });

  logger.info({ userId }, "account.email.change.confirmed");
}

// ---------------------------------------------------------------------------------

export async function updateAccountProfile(input: {
  userId: string;
  name?: string | null;
  email?: string | null;
  preferredAiMode?: string | null;
  notificationPreferences?: NotificationPreferences | null;
}) {
  if (input.name !== undefined && input.name !== null && input.name.length > 120) {
    throw new Error("Name must be 120 characters or fewer.");
  }
  if (input.email !== undefined && input.email !== null) {
    // Email changes go through a verification flow — do not persist here.
    throw new Error("Use initiateEmailChange to update the email address.");
  }
  if (
    input.preferredAiMode !== undefined &&
    input.preferredAiMode !== null &&
    !ALLOWED_AI_MODES.includes(input.preferredAiMode as (typeof ALLOWED_AI_MODES)[number])
  ) {
    throw new Error("Invalid AI mode.");
  }

  const normalizedPreferences =
    input.notificationPreferences !== undefined
      ? normalizeNotificationPreferences(input.notificationPreferences)
      : undefined;

  const changedFields = (
    [
      input.name !== undefined && "name",
      input.preferredAiMode !== undefined && "preferredAiMode",
      input.notificationPreferences !== undefined && "notificationPreferences"
    ] as const
  ).filter(Boolean);

  const result = await prisma.user.update({
    where: { id: input.userId },
    data: {
      name: input.name ?? undefined,
      preferredAiMode: input.preferredAiMode ?? undefined,
      notificationPreferences:
        normalizedPreferences !== undefined
          ? (normalizedPreferences as Prisma.InputJsonValue)
          : undefined
    },
    select: { id: true, name: true, email: true, image: true, updatedAt: true, notificationPreferences: true }
  });

  logger.info({ userId: input.userId, changedFields }, "account.profile.updated");

  return result;
}

export async function softDeleteAccount(userId: string) {
  const deletedAt = new Date();
  const existingUser = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      email: true
    }
  });

  const user = await withSystemScope(async (tx) => {
    const updatedUser = await tx.user.update({
      where: { id: userId },
      data: {
        deletedAt,
        email: null,
        phone: null,
        image: null,
        preferredAiMode: null,
        notificationPreferences: Prisma.JsonNull
      }
    });

    await tx.membership.updateMany({
      where: { userId, isActive: true },
      data: { isActive: false }
    });

    await tx.userConsent.updateMany({
      where: {
        userId,
        revokedAt: null
      },
      data: {
        revokedAt: deletedAt
      }
    });

    return updatedUser;
  });

  if (existingUser.email) {
    await sendEmail({
      to: existingUser.email,
      subject: "Your Heita account deletion has been scheduled",
      text: "Your Heita account has been marked for deletion and your active memberships were cancelled.",
      html:
        "<p>Your Heita account has been marked for deletion and your active memberships were cancelled.</p>"
    }).catch(() => undefined);
  }

  return user;
}
