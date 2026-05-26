import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Sparkles } from "lucide-react";

import { BusinessCard } from "@/components/business/business-card";
import { Card } from "@/components/ui/card";
import { Chip, TierBadge } from "@/components/ui/badge";
import { isBuildPhase } from "@/lib/build-phase";

export const metadata = { title: "Wallet" };
export const dynamic = "force-dynamic";

export default async function WalletPage() {
  if (isBuildPhase()) {
    return <section className="grid gap-5" />;
  }

  const [{ auth }, { resolveLocale }, { prisma }] = await Promise.all([
    import("@/lib/auth"),
    import("@/i18n/locale"),
    import("@/lib/prisma")
  ]);
  const session = await auth();
  const locale = await resolveLocale();
  const t = await getTranslations("wallet");

  if (!session?.user?.id) {
    redirect("/sign-in?callbackUrl=/wallet");
  }

  const memberships = await prisma.membership.findMany({
    where: { userId: session.user.id, isActive: true },
    include: {
      business: true,
      tier: true,
      transactions: {
        orderBy: { createdAt: "desc" },
        take: 5
      }
    },
    orderBy: { joinedAt: "desc" }
  });

  const totalPoints = memberships.reduce((sum, m) => sum + m.pointsBalance, 0);

  return (
    <section className="grid gap-5">
      <Card variant="hero" className="px-6 py-8 sm:px-8">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/70">
          {t("eyebrow")}
        </p>
        <p className="mt-3 font-display text-5xl font-extrabold tracking-tight">
          {new Intl.NumberFormat(locale).format(totalPoints)}
        </p>
        <p className="mt-1 text-white/75">
          {t("totalPoints", { count: memberships.length })}
        </p>
      </Card>

      {memberships.length === 0 ? (
        <Card variant="outline" className="text-center">
          <Sparkles className="mx-auto h-7 w-7 text-primary" />
          <p className="mt-3 text-ink-muted">
            {t("emptyBody")}
          </p>
        </Card>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2">
        {memberships.map((membership) => (
          <div key={membership.id} className="space-y-3">
            <BusinessCard
              business={{
                name: membership.business.name,
                slug: membership.business.slug,
                category: membership.business.category
              }}
              tier={membership.tier ? { name: membership.tier.name } : null}
              points={membership.pointsBalance}
              labels={{
                points: t("pointsLabel"),
                viewBusiness: t("viewBusiness"),
                rewards: t("rewards"),
                openChat: t("openChat"),
                history: t("history")
              }}
            />
            <Card variant="outline" className="space-y-3">
              <header className="flex items-center justify-between">
                <h3 className="font-display text-sm font-semibold text-ink-muted">
                  {t("recentActivity")}
                </h3>
                <TierBadge tier={membership.tier?.name} />
              </header>
              {membership.transactions.length ? (
                <ul className="space-y-2">
                  {membership.transactions.map((transaction) => (
                    <li
                      key={transaction.id}
                      className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface-elevated px-3 py-2 text-sm"
                    >
                      <div>
                        <p className="font-medium text-ink">
                          {transaction.description ?? transaction.type}
                        </p>
                        <p className="text-xs text-ink-subtle">
                          {transaction.createdAt.toLocaleDateString(locale, {
                            day: "2-digit",
                            month: "short",
                            year: "numeric"
                          })}
                        </p>
                      </div>
                      <Chip
                        variant={transaction.pointsDelta >= 0 ? "success" : "warning"}
                        size="sm"
                      >
                        {transaction.pointsDelta >= 0 ? "+" : ""}
                        {transaction.pointsDelta}
                      </Chip>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-ink-subtle">{t("noActivity")}</p>
              )}
            </Card>
          </div>
        ))}
      </div>
    </section>
  );
}
