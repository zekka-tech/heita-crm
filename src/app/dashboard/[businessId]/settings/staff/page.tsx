import type { Route } from "next";
import Link from "next/link";
import { StaffInviteStatus, StaffRole } from "@prisma/client";
import { notFound, redirect } from "next/navigation";
import { Mail, Phone, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/badge";
import { Input, Select } from "@/components/ui/input";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasStaffRoleAccess } from "@/lib/staff";
import {
  createInviteAction,
  revokeInviteAction
} from "@/app/dashboard/[businessId]/settings/staff/actions";
import { StaffMemberActions } from "@/app/dashboard/[businessId]/settings/staff/staff-member-actions";
import { CsrfField } from "@/components/security/csrf-field";

export const dynamic = "force-dynamic";
import {
  listStaffInvites
} from "@/server/services/staff-invite.service";

type SettingsStaffPageProps = {
  params: Promise<{ businessId: string }>;
};

export default async function SettingsStaffPage({ params }: SettingsStaffPageProps) {
  const { businessId } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/sign-in?callbackUrl=/dashboard/${businessId}/settings/staff`);
  }

  const staffRecord = await prisma.staffMember.findUnique({
    where: {
      businessId_userId: {
        businessId,
        userId: session.user.id
      }
    },
    include: {
      business: { select: { id: true, name: true, slug: true } }
    }
  });

  if (!staffRecord) notFound();

  const canManage = hasStaffRoleAccess(staffRecord.role, [StaffRole.OWNER]);

  const [staffMembers, invites] = await Promise.all([
    prisma.staffMember.findMany({
      where: { businessId, user: { deletedAt: null } },
      include: { user: { select: { id: true, name: true, email: true, phone: true } } },
      orderBy: { joinedAt: "asc" }
    }),
    canManage
      ? listStaffInvites({ businessId, actorUserId: session.user.id })
      : Promise.resolve([])
  ]);

  return (
    <main className="px-4 pb-24 pt-6 sm:px-8">
      <Card variant="hero" className="px-6 py-7 sm:px-10">
        <Chip variant="primary" className="bg-white/15 text-white border-white/20">
          <Users className="h-3.5 w-3.5" />
          {staffRecord.business.name} · Staff
        </Chip>
        <h1 className="mt-4 font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
          Team & invitations
        </h1>
        <p className="mt-2 max-w-2xl text-white/85">
          Owners can invite managers, staff, and AI trainers. Invites are
          single-use, expire in 72 hours, and can be revoked at any time.
        </p>
      </Card>

      {canManage ? (
        <Card variant="surface" className="mt-6 space-y-4">
          <h2 className="section-title">Invite a teammate</h2>
          <form action={createInviteAction} className="grid gap-3 md:grid-cols-4">
            <CsrfField />
            <input type="hidden" name="businessId" value={businessId} />
            <Input
              name="email"
              label="Email"
              type="email"
              placeholder="someone@business.co.za"
              className="md:col-span-2"
            />
            <Input
              name="phone"
              label="Phone"
              type="tel"
              placeholder="+27 82 000 0000"
            />
            <Select label="Role" name="role" defaultValue={StaffRole.STAFF} required>
              {Object.values(StaffRole).map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </Select>
            <Button type="submit" variant="primary" className="md:col-span-4">
              Send invite
            </Button>
          </form>
        </Card>
      ) : null}

      <Card variant="surface" className="mt-6 space-y-3">
        <h2 className="section-title">Current team</h2>
        <ul className="grid gap-2">
          {staffMembers.map((member) => (
            <li
              key={member.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface-elevated px-3 py-3"
            >
              <div>
                <p className="font-medium text-ink">
                  {member.user.name ?? member.user.email ?? member.user.phone ?? member.user.id}
                </p>
                <p className="text-xs text-ink-subtle">
                  Joined {member.joinedAt.toLocaleDateString("en-ZA")}
                </p>
              </div>
              {canManage && member.user.id !== session.user.id ? (
                <StaffMemberActions
                  businessId={businessId}
                  targetUserId={member.user.id}
                  currentRole={member.role}
                  name={member.user.name ?? member.user.email ?? "member"}
                />
              ) : (
                <Chip variant="primary" size="sm">
                  {member.role}
                </Chip>
              )}
            </li>
          ))}
        </ul>
      </Card>

      {canManage ? (
        <Card variant="surface" className="mt-6 space-y-3">
          <h2 className="section-title">Outstanding invites</h2>
          {invites.length ? (
            <ul className="grid gap-2">
              {invites.map((invite) => (
                <li
                  key={invite.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface-elevated px-3 py-3"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-sm text-ink">
                      {invite.email ? (
                        <span className="inline-flex items-center gap-1">
                          <Mail className="h-3.5 w-3.5" />
                          {invite.email}
                        </span>
                      ) : null}
                      {invite.phone ? (
                        <span className="inline-flex items-center gap-1">
                          <Phone className="h-3.5 w-3.5" />
                          {invite.phone}
                        </span>
                      ) : null}
                    </div>
                    <p className="text-xs text-ink-subtle">
                      {invite.status} · expires{" "}
                      {invite.expiresAt.toLocaleString("en-ZA")}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Chip variant="primary" size="sm">
                      {invite.role}
                    </Chip>
                    {invite.status === StaffInviteStatus.PENDING ? (
                      <form action={revokeInviteAction}>
                        <CsrfField />
                        <input type="hidden" name="businessId" value={businessId} />
                        <input type="hidden" name="inviteId" value={invite.id} />
                        <Button type="submit" variant="ghost" size="sm">
                          Revoke
                        </Button>
                      </form>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-muted">No outstanding invites.</p>
          )}
          <p className="text-xs text-ink-subtle">
            Need to manage permissions? Tier hierarchy is enforced:
            OWNER &gt; MANAGER &gt; STAFF, with AI_TRAINER orthogonal.{" "}
            <Link
              href={`/dashboard/${businessId}` as Route}
              className="text-primary-action underline"
            >
              Back to dashboard
            </Link>
            .
          </p>
        </Card>
      ) : null}
    </main>
  );
}
