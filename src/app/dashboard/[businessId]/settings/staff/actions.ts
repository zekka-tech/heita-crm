"use server";

import { StaffRole } from "@prisma/client";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { requireCsrfFormData } from "@/lib/csrf";
import {
  createStaffInvite,
  revokeStaffInvite
} from "@/server/services/staff-invite.service";

export async function createInviteAction(formData: FormData) {
  await requireCsrfFormData(formData);

  const session = await auth();
  const businessId = String(formData.get("businessId") ?? "");

  if (!session?.user?.id) {
    redirect(`/sign-in?callbackUrl=/dashboard/${businessId}/settings/staff`);
  }

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

  await revokeStaffInvite({
    inviteId,
    actorUserId: session.user.id
  });

  redirect(`/dashboard/${businessId}/settings/staff?revoked=1`);
}
