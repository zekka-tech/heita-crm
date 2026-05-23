import { redirect } from "next/navigation";
import { Mail, Phone, Sparkles, Trash2, UserRound } from "lucide-react";

import { ProfileSettings } from "@/components/account/profile-settings";
import { PushSubscriptionCard } from "@/components/account/push-subscription-card";
import { Card } from "@/components/ui/card";
import { Chip, TierBadge } from "@/components/ui/badge";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Profile" };

export default async function ProfilePage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/sign-in?callbackUrl=/profile");
  }

  const [user, memberships, staffRoles] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: session.user.id } }),
    prisma.membership.findMany({
      where: { userId: session.user.id, isActive: true },
      include: { business: true, tier: true }
    }),
    prisma.staffMember.findMany({
      where: { userId: session.user.id },
      include: { business: true }
    })
  ]);

  return (
    <section className="grid gap-5">
      <Card variant="hero" className="flex items-center gap-5 px-6 py-7 sm:px-8">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/15 text-2xl font-display font-bold">
          <UserRound className="h-7 w-7" />
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/70">
            Profile
          </p>
          <h1 className="mt-2 font-display text-2xl font-extrabold">
            {user.name ?? "Heita member"}
          </h1>
          <div className="mt-2 flex flex-wrap gap-2 text-sm text-white/80">
            {user.phone ? (
              <span className="inline-flex items-center gap-1">
                <Phone className="h-3.5 w-3.5" />
                {user.phone}
              </span>
            ) : null}
            {user.email ? (
              <span className="inline-flex items-center gap-1">
                <Mail className="h-3.5 w-3.5" />
                {user.email}
              </span>
            ) : null}
          </div>
        </div>
      </Card>

      <Card variant="surface" className="space-y-4">
        <header className="flex items-center justify-between">
          <h2 className="section-title">Memberships</h2>
          <Chip variant="primary" size="sm">
            <Sparkles className="h-3 w-3" /> {memberships.length} active
          </Chip>
        </header>
        {memberships.length ? (
          <ul className="grid gap-2">
            {memberships.map((membership) => (
              <li
                key={membership.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface-elevated px-3 py-3"
              >
                <div>
                  <p className="font-medium text-ink">{membership.business.name}</p>
                  <p className="text-xs text-ink-subtle">
                    Joined{" "}
                    {membership.joinedAt.toLocaleDateString("en-ZA", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric"
                    })}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <TierBadge tier={membership.tier?.name} />
                  <span className="font-display font-semibold text-primary-action">
                    {membership.pointsBalance.toLocaleString()} pts
                  </span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-muted">No memberships yet.</p>
        )}
      </Card>

      {staffRoles.length ? (
        <Card variant="surface" className="space-y-4">
          <h2 className="section-title">Staff roles</h2>
          <ul className="grid gap-2">
            {staffRoles.map((role) => (
              <li
                key={role.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface-elevated px-3 py-3"
              >
                <p className="font-medium text-ink">{role.business.name}</p>
                <Chip variant="primary" size="sm">
                  {role.role}
                </Chip>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <ProfileSettings
        initialName={user.name ?? ""}
        initialEmail={user.email ?? ""}
        initialPreferredAiMode={user.preferredAiMode ?? "auto"}
      />

      <PushSubscriptionCard />

      <Card variant="outline" className="space-y-3 border-danger/30 bg-danger/5">
        <div className="flex items-center gap-2 text-danger">
          <Trash2 className="h-4 w-4" />
          <h2 className="font-display text-base font-semibold">Danger zone</h2>
        </div>
        <p className="text-sm text-ink-muted">
          Deleting your account now starts a 30-day deletion window, cancels active
          memberships, and revokes active consents.
        </p>
      </Card>
    </section>
  );
}
