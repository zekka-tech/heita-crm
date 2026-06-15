import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Mail, Phone, Sparkles, Trash2, UserRound } from "lucide-react";

import { DeleteAccountButton } from "@/components/account/delete-account-button";
import { NotificationPreferencesCard } from "@/components/account/notification-preferences-card";
import { ProfileSettings } from "@/components/account/profile-settings";
import { PushSubscriptionCard } from "@/components/account/push-subscription-card";
import { SignOutButtonForm } from "@/components/auth/sign-out-button-form";
import { Card } from "@/components/ui/card";
import { Chip, TierBadge } from "@/components/ui/badge";
import { auth } from "@/lib/auth";
import { resolveLocale } from "@/i18n/locale";
import { normalizeNotificationPreferences } from "@/lib/notification-preferences";
import { prisma, withUserScope } from "@/lib/prisma";

export const metadata = { title: "Profile" };
export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const session = await auth();
  const locale = await resolveLocale();
  const t = await getTranslations("profile");

  if (!session?.user?.id) {
    redirect("/sign-in?callbackUrl=/profile");
  }

  const [user, memberships, staffRoles] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: session.user.id } }),
    withUserScope(session.user.id, (tx) =>
      tx.membership.findMany({
        where: { userId: session.user.id, isActive: true },
        include: { business: true, tier: true }
      })
    ),
    withUserScope(session.user.id, (tx) =>
      tx.staffMember.findMany({
        where: { userId: session.user.id },
        include: { business: true }
      })
    )
  ]);

  return (
    <section className="grid gap-5">
      <Card variant="hero" className="flex items-start justify-between gap-4 px-6 py-7 sm:px-8">
        <div className="flex items-center gap-5">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/15 text-2xl font-display font-bold">
            <UserRound className="h-7 w-7" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/70">
              {t("eyebrow")}
            </p>
            <h1 className="mt-2 font-display text-2xl font-extrabold">
              {user.name ?? t("defaultName")}
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
        </div>
        <SignOutButtonForm
          className="relative z-10 shrink-0"
          variant="secondary"
          buttonClassName="!border-slate-950 !bg-slate-900 !text-white hover:!bg-slate-800"
          label="Log out"
        />
      </Card>

      <Card variant="surface" className="space-y-4">
        <header className="flex items-center justify-between">
          <h2 className="section-title">{t("memberships")}</h2>
          <Chip variant="primary" size="sm">
            <Sparkles className="h-3 w-3" /> {t("activeCount", { count: memberships.length })}
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
                    {t("joined")}{" "}
                    {membership.joinedAt.toLocaleDateString(locale, {
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
          <p className="text-sm text-ink-muted">{t("noMemberships")}</p>
        )}
      </Card>

      {staffRoles.length ? (
        <Card variant="surface" className="space-y-4">
          <h2 className="section-title">{t("staffRoles")}</h2>
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

      <NotificationPreferencesCard
        businesses={memberships.map((membership) => ({
          id: membership.business.id,
          name: membership.business.name
        }))}
        initialPreferences={normalizeNotificationPreferences(user.notificationPreferences)}
      />

      <PushSubscriptionCard />

      <Card variant="outline" className="space-y-3 border-danger/30 bg-danger/5">
        <div className="flex items-center gap-2 text-danger">
          <Trash2 className="h-4 w-4" />
          <h2 className="font-display text-base font-semibold">{t("dangerZone")}</h2>
        </div>
        <p className="text-sm text-ink-muted">
          {t("dangerBody")}
        </p>
        <DeleteAccountButton />
      </Card>
    </section>
  );
}
