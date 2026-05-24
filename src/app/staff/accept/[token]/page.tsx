import type { Route } from "next";
import Link from "next/link";
import { StaffInviteStatus } from "@prisma/client";

import { acceptInviteAction } from "@/app/staff/accept/[token]/actions";
import { CsrfField } from "@/components/security/csrf-field";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/badge";
import { auth } from "@/lib/auth";
import { getInviteByToken } from "@/server/services/staff-invite.service";

export const dynamic = "force-dynamic";

type StaffAcceptPageProps = {
  params: Promise<{ token: string }>;
};

export default async function StaffAcceptPage({ params }: StaffAcceptPageProps) {
  const { token } = await params;
  const session = await auth();
  const invite = await getInviteByToken(token);

  if (!invite) {
    return (
      <main className="px-4 py-10 sm:px-8">
        <Card variant="surface" className="mx-auto max-w-md space-y-4">
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink">
            Invite not found
          </h1>
          <p className="text-sm text-ink-muted">
            This invite is no longer valid. Ask the business owner to send a fresh one.
          </p>
          <Link
            href="/sign-in"
            className="text-sm font-medium text-primary-action underline"
          >
            Return to sign-in
          </Link>
        </Card>
      </main>
    );
  }

  const expired = invite.status === StaffInviteStatus.EXPIRED;
  const revoked = invite.status === StaffInviteStatus.REVOKED;
  const accepted = invite.status === StaffInviteStatus.ACCEPTED;

  return (
    <main className="px-4 py-10 sm:px-8">
      <Card variant="surface" className="mx-auto max-w-md space-y-5">
        <Chip variant="primary" size="sm">
          Staff invitation
        </Chip>
        <h1 className="font-display text-3xl font-extrabold tracking-tight text-ink">
          Join {invite.business.name}
        </h1>
        <p className="text-sm text-ink-muted">
          You have been invited as <strong>{invite.role}</strong>.
        </p>

        {accepted ? (
          <Chip variant="success" size="sm">
            Already accepted — head to your dashboard.
          </Chip>
        ) : revoked ? (
          <Chip variant="warning" size="sm">
            This invite was revoked.
          </Chip>
        ) : expired ? (
          <Chip variant="warning" size="sm">
            This invite expired on {invite.expiresAt.toLocaleString("en-ZA")}.
          </Chip>
        ) : (
          <p className="text-xs text-ink-subtle">
            Expires {invite.expiresAt.toLocaleString("en-ZA")}.
          </p>
        )}

        {!session?.user?.id ? (
          <Button asChild variant="primary" size="lg">
            <Link href={`/sign-in?callbackUrl=/staff/accept/${token}`}>
              Sign in to accept
            </Link>
          </Button>
        ) : accepted || revoked || expired ? (
          <Button asChild variant="secondary">
            <Link href={`/dashboard/${invite.business.id}` as Route}>Open dashboard</Link>
          </Button>
        ) : (
          <form action={acceptInviteAction} className="grid gap-3">
            <CsrfField />
            <input type="hidden" name="token" value={token} />
            <Button type="submit" variant="primary" size="lg">
              Accept and join
            </Button>
            <p className="text-xs text-ink-subtle">
              Accepting will add you to the team with the role above. You can
              revoke your own membership later from your profile.
            </p>
          </form>
        )}
      </Card>
    </main>
  );
}
