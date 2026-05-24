"use server";

import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { acceptStaffInvite } from "@/server/services/staff-invite.service";

export async function acceptInviteAction(formData: FormData) {
  const session = await auth();
  const token = String(formData.get("token") ?? "");

  if (!session?.user?.id) {
    redirect(`/sign-in?callbackUrl=/staff/accept/${token}`);
  }

  const staffMember = await acceptStaffInvite({
    token,
    userId: session.user.id
  });

  redirect(`/dashboard/${staffMember.businessId}?invitedAs=${staffMember.role}`);
}
