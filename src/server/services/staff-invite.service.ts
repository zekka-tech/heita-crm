import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import { StaffInviteStatus, StaffRole } from "@prisma/client";

import { sendEmail } from "@/lib/email";
import { logger } from "@/lib/logger";
import { normalizeZaPhone } from "@/lib/phone";
import { withBusinessScope, withSystemScope } from "@/lib/prisma";
import { requireRole } from "@/lib/staff";
import { sendOtpSms } from "@/lib/sms";
import { recordStaffAuditLog } from "@/server/services/staff-audit.service";
import { checkPlanLimit } from "@/server/services/billing.service";

const INVITE_TTL_HOURS = 72;

function getInviteSecret(): string {
  const secret = process.env.AUTH_SECRET ?? process.env.STAFF_INVITE_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("AUTH_SECRET is required to sign staff invite tokens.");
    }
    return "heita-dev-invite-secret";
  }
  return secret;
}

function hashInviteToken(token: string): string {
  return createHash("sha256")
    .update(`${getInviteSecret()}:${token}`)
    .digest("hex");
}

function generateInviteToken(): string {
  return randomBytes(24).toString("hex");
}

export type CreateStaffInviteInput = {
  businessId: string;
  actorUserId: string;
  role: StaffRole;
  email?: string | null;
  phone?: string | null;
};

export async function createStaffInvite(input: CreateStaffInviteInput) {
  if (!input.email && !input.phone) {
    throw new Error("Provide an email or phone number to invite a staff member.");
  }

  await requireRole({
    businessId: input.businessId,
    userId: input.actorUserId,
    allowedRoles: [StaffRole.OWNER]
  });

  const seatCheck = await checkPlanLimit(input.businessId, "staffSeats");
  if (!seatCheck.allowed) {
    throw new Error(
      `Staff seat limit reached (${seatCheck.current}/${seatCheck.limit}). Upgrade your plan to invite more staff.`
    );
  }

  const normalizedPhone = input.phone ? normalizeZaPhone(input.phone) : null;
  if (input.phone && !normalizedPhone) {
    throw new Error("Provide a valid South African phone number for the invite.");
  }

  const token = generateInviteToken();
  const tokenHash = hashInviteToken(token);
  const expiresAt = new Date(Date.now() + INVITE_TTL_HOURS * 60 * 60 * 1000);

  const invite = await withBusinessScope(input.businessId, async (tx) => {
    const createdInvite = await tx.staffInvite.create({
      data: {
        businessId: input.businessId,
        email: input.email?.toLowerCase() ?? null,
        phone: normalizedPhone,
        role: input.role,
        tokenHash,
        invitedById: input.actorUserId,
        status: StaffInviteStatus.PENDING,
        expiresAt
      },
      include: {
        business: { select: { name: true, slug: true } }
      }
    });

    await recordStaffAuditLog(
      {
        businessId: input.businessId,
        actorUserId: input.actorUserId,
        action: "STAFF_INVITE_CREATE",
        targetType: "StaffInvite",
        targetId: createdInvite.id,
        metadata: {
          role: input.role,
          email: createdInvite.email,
          phone: createdInvite.phone,
          expiresAt: createdInvite.expiresAt.toISOString()
        }
      },
      tx
    );

    return createdInvite;
  });

  const acceptUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/staff/accept/${token}`;

  if (invite.email) {
    try {
      await sendEmail({
        to: invite.email,
        subject: `You're invited to join ${invite.business.name} on Heita`,
        text: `You've been invited as ${invite.role} for ${invite.business.name}. Accept by ${expiresAt.toISOString()}: ${acceptUrl}`,
        html: `<p>You've been invited as <strong>${invite.role}</strong> for <strong>${invite.business.name}</strong>.</p><p><a href="${acceptUrl}">Accept the invite</a> (expires ${expiresAt.toISOString()}).</p>`
      });
    } catch (error) {
      logger.warn({ err: error, inviteId: invite.id }, "staff_invite.email_failed");
    }
  }

  if (invite.phone) {
    try {
      await sendOtpSms({
        to: invite.phone,
        code: token.slice(0, 8)
      });
    } catch (error) {
      logger.warn({ err: error, inviteId: invite.id }, "staff_invite.sms_failed");
    }
  }

  return {
    invite,
    token,
    acceptUrl
  };
}

export async function listStaffInvites(input: { businessId: string; actorUserId: string }) {
  await requireRole({
    businessId: input.businessId,
    userId: input.actorUserId,
    allowedRoles: [StaffRole.OWNER, StaffRole.MANAGER]
  });

  const now = new Date();

  return withBusinessScope(input.businessId, async (tx) => {
    // Eagerly mark expired invites — surfaces clean status to the UI and is
    // cheap because StaffInvite is bounded.
    await tx.staffInvite.updateMany({
      where: {
        businessId: input.businessId,
        status: StaffInviteStatus.PENDING,
        expiresAt: { lt: now }
      },
      data: { status: StaffInviteStatus.EXPIRED }
    });

    return tx.staffInvite.findMany({
      where: { businessId: input.businessId },
      orderBy: { createdAt: "desc" },
      include: {
        invitedBy: { select: { id: true, name: true, email: true } }
      }
    });
  });
}

export async function revokeStaffInvite(input: {
  inviteId: string;
  actorUserId: string;
}) {
  // Resolve the invite by id under system scope to learn its businessId, then
  // re-enter withBusinessScope for the revoke write below.
  const invite = await withSystemScope((tx) =>
    tx.staffInvite.findUniqueOrThrow({
      where: { id: input.inviteId }
    })
  );

  await requireRole({
    businessId: invite.businessId,
    userId: input.actorUserId,
    allowedRoles: [StaffRole.OWNER]
  });

  if (invite.status !== StaffInviteStatus.PENDING) {
    return invite;
  }

  return withBusinessScope(invite.businessId, async (tx) => {
    const revokedInvite = await tx.staffInvite.update({
      where: { id: invite.id },
      data: {
        status: StaffInviteStatus.REVOKED,
        revokedAt: new Date()
      }
    });

    await recordStaffAuditLog(
      {
        businessId: invite.businessId,
        actorUserId: input.actorUserId,
        action: "STAFF_INVITE_REVOKE",
        targetType: "StaffInvite",
        targetId: invite.id,
        metadata: {
          email: invite.email,
          phone: invite.phone,
          role: invite.role
        }
      },
      tx
    );

    return revokedInvite;
  });
}

export async function getInviteByToken(token: string) {
  const tokenHash = hashInviteToken(token);
  // Token is the bearer credential; resolve cross-tenant by hash under system
  // scope (no tenant context exists until the token is resolved).
  const invite = await withSystemScope((tx) =>
    tx.staffInvite.findUnique({
      where: { tokenHash },
      include: {
        business: { select: { id: true, name: true, slug: true } }
      }
    })
  );

  if (!invite) return null;

  if (
    invite.status === StaffInviteStatus.PENDING &&
    invite.expiresAt.getTime() < Date.now()
  ) {
    await withBusinessScope(invite.businessId, (tx) =>
      tx.staffInvite.update({
        where: { id: invite.id },
        data: { status: StaffInviteStatus.EXPIRED }
      })
    ).catch(() => undefined);
    return { ...invite, status: StaffInviteStatus.EXPIRED };
  }

  return invite;
}

export async function acceptStaffInvite(input: {
  token: string;
  userId: string;
}) {
  const tokenHash = hashInviteToken(input.token);
  // Token is the bearer credential; resolve cross-tenant by hash under system
  // scope before re-entering withBusinessScope for the accept writes below.
  const inviteRecord = await withSystemScope((tx) =>
    tx.staffInvite.findUnique({
      where: { tokenHash }
    })
  );

  if (!inviteRecord) {
    throw new Error("This invite is no longer valid.");
  }

  // Defend against timing side-channels even though the hash above is already
  // pinned to the secret — never compare strings non-constant-time on
  // anything derived from user input.
  const expectedBuffer = Buffer.from(inviteRecord.tokenHash);
  const candidateBuffer = Buffer.from(tokenHash);
  if (
    expectedBuffer.length !== candidateBuffer.length ||
    !timingSafeEqual(expectedBuffer, candidateBuffer)
  ) {
    throw new Error("This invite is no longer valid.");
  }

  if (inviteRecord.status !== StaffInviteStatus.PENDING) {
    throw new Error("This invite has already been used or revoked.");
  }

  if (inviteRecord.expiresAt.getTime() < Date.now()) {
    await withBusinessScope(inviteRecord.businessId, (tx) =>
      tx.staffInvite.update({
        where: { id: inviteRecord.id },
        data: { status: StaffInviteStatus.EXPIRED }
      })
    );
    throw new Error("This invite has expired.");
  }

  return withBusinessScope(inviteRecord.businessId, async (tx) => {
    const staffMember = await tx.staffMember.upsert({
      where: {
        businessId_userId: {
          businessId: inviteRecord.businessId,
          userId: input.userId
        }
      },
      update: {
        role: inviteRecord.role,
        invitedById: inviteRecord.invitedById
      },
      create: {
        businessId: inviteRecord.businessId,
        userId: input.userId,
        role: inviteRecord.role,
        invitedById: inviteRecord.invitedById
      }
    });

    await tx.staffInvite.update({
      where: { id: inviteRecord.id },
      data: {
        status: StaffInviteStatus.ACCEPTED,
        acceptedAt: new Date(),
        acceptedById: input.userId
      }
    });

    return staffMember;
  });
}

export async function removeStaffMember(input: {
  businessId: string;
  targetUserId: string;
  actorUserId: string;
}) {
  await requireRole({
    businessId: input.businessId,
    userId: input.actorUserId,
    allowedRoles: [StaffRole.OWNER]
  });

  if (input.targetUserId === input.actorUserId) {
    throw new Error("You cannot remove yourself from the business.");
  }

  return withBusinessScope(input.businessId, async (tx) => {
    const staffMember = await tx.staffMember.findUnique({
      where: { businessId_userId: { businessId: input.businessId, userId: input.targetUserId } }
    });

    if (!staffMember) {
      throw new Error("Staff member not found.");
    }

    if (staffMember.role === StaffRole.OWNER) {
      throw new Error("Cannot remove the business owner.");
    }

    const removed = await tx.staffMember.delete({
      where: { businessId_userId: { businessId: input.businessId, userId: input.targetUserId } }
    });

    await recordStaffAuditLog(
      {
        businessId: input.businessId,
        actorUserId: input.actorUserId,
        action: "STAFF_MEMBER_REMOVE",
        targetType: "StaffMember",
        targetId: input.targetUserId,
        metadata: { removedRole: staffMember.role }
      },
      tx
    );

    return removed;
  });
}

export async function updateStaffRole(input: {
  businessId: string;
  targetUserId: string;
  newRole: StaffRole;
  actorUserId: string;
}) {
  await requireRole({
    businessId: input.businessId,
    userId: input.actorUserId,
    allowedRoles: [StaffRole.OWNER]
  });

  if (input.targetUserId === input.actorUserId) {
    throw new Error("You cannot change your own role.");
  }

  if (input.newRole === StaffRole.OWNER) {
    throw new Error("Cannot promote a member to OWNER via this action.");
  }

  return withBusinessScope(input.businessId, async (tx) => {
    const staffMember = await tx.staffMember.findUnique({
      where: { businessId_userId: { businessId: input.businessId, userId: input.targetUserId } }
    });

    if (!staffMember) {
      throw new Error("Staff member not found.");
    }

    if (staffMember.role === StaffRole.OWNER) {
      throw new Error("Cannot change the role of the business owner.");
    }

    const updated = await tx.staffMember.update({
      where: { businessId_userId: { businessId: input.businessId, userId: input.targetUserId } },
      data: { role: input.newRole }
    });

    await recordStaffAuditLog(
      {
        businessId: input.businessId,
        actorUserId: input.actorUserId,
        action: "STAFF_ROLE_CHANGE",
        targetType: "StaffMember",
        targetId: input.targetUserId,
        metadata: { previousRole: staffMember.role, newRole: input.newRole }
      },
      tx
    );

    return updated;
  });
}
