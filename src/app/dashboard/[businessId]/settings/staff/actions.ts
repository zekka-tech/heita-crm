"use server";

import { StaffRole } from "@prisma/client";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { requireCsrfFormData } from "@/lib/csrf";
import { withUserScope } from "@/lib/prisma";
import {
  createStaffInvite,
  removeStaffMember,
  revokeStaffInvite,
  updateStaffRole
} from "@/server/services/staff-invite.service";

async function requireStaffAccess(userId: string, businessId: string) {
  const member = await withUserScope(userId, (tx) =>
    tx.staffMember.findUnique({
      where: { businessId_userId: { businessId, userId } },
      select: { role: true }
    })
  );
  if (!member) throw new Error("Access denied.");
  return member;
}

export async function createInviteAction(formData: FormData) {
  await requireCsrfFormData(formData);

  const session = await auth();
  const businessId = String(formData.get("businessId") ?? "");

  if (!session?.user?.id) {
    redirect(`/sign-in?callbackUrl=/dashboard/${businessId}/settings/staff`);
  }

  await requireStaffAccess(session.user.id, businessId);

  const email = String(formData.get("email") ?? "").trim() || null;
  const phone = String(formData.get("phone") ?? "").trim() || null;
  const role = String(formData.get("role") ?? "") as StaffRole;

  if (!Object.values(StaffRole).includes(role)) {
    throw new Error("Choose a valid staff role.");
  }

  await createStaffInvite({
    businessId,
    actorUserId: session.user.id,
    email,
    phone,
    role
  });

  redirect(`/dashboard/${businessId}/settings/staff?invited=1`);
}

export async function revokeInviteAction(formData: FormData) {
  await requireCsrfFormData(formData);

  const session = await auth();
  const businessId = String(formData.get("businessId") ?? "");
  const inviteId = String(formData.get("inviteId") ?? "");

  if (!session?.user?.id) {
    redirect(`/sign-in?callbackUrl=/dashboard/${businessId}/settings/staff`);
  }

  await requireStaffAccess(session.user.id, businessId);

  await revokeStaffInvite({
    inviteId,
    actorUserId: session.user.id
  });

  redirect(`/dashboard/${businessId}/settings/staff?revoked=1`);
}

export async function removeStaffMemberAction(formData: FormData) {
  await requireCsrfFormData(formData);

  const session = await auth();
  const businessId = String(formData.get("businessId") ?? "");
  const targetUserId = String(formData.get("targetUserId") ?? "");

  if (!session?.user?.id) {
    redirect(`/sign-in?callbackUrl=/dashboard/${businessId}/settings/staff`);
  }

  await removeStaffMember({
    businessId,
    targetUserId,
    actorUserId: session.user.id
  });

  redirect(`/dashboard/${businessId}/settings/staff?removed=1`);
}

export async function updateStaffRoleAction(formData: FormData) {
  await requireCsrfFormData(formData);

  const session = await auth();
  const businessId = String(formData.get("businessId") ?? "");
  const targetUserId = String(formData.get("targetUserId") ?? "");
  const newRole = String(formData.get("newRole") ?? "") as StaffRole;

  if (!session?.user?.id) {
    redirect(`/sign-in?callbackUrl=/dashboard/${businessId}/settings/staff`);
  }

  if (!Object.values(StaffRole).includes(newRole) || newRole === StaffRole.OWNER) {
    throw new Error("Invalid role.");
  }

  await updateStaffRole({
    businessId,
    targetUserId,
    newRole,
    actorUserId: session.user.id
  });

  redirect(`/dashboard/${businessId}/settings/staff?roleUpdated=1`);
}
