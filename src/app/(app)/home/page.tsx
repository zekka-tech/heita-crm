import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowRight, Plus, Search, Sparkles } from "lucide-react";

import { BusinessCard } from "@/components/business/business-card";
import { PushPermissionNudge } from "@/components/account/push-permission-nudge";
import { FlashBanner } from "@/components/shared/flash-banner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/badge";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveLocale } from "@/i18n/locale";
import { discoverBusinesses } from "@/server/services/discovery.service";

export const metadata = { title: "Home" };
export const dynamic = "force-dynamic";

type HomePageProps = {
  searchParams?: Promise<{ q?: string }>;
};

export default async function HomePage({ searchParams }: HomePageProps) {
  const session = await auth();
  const locale = await resolveLocale();
  const t = await getTranslations("home");
  const resolvedSearchParams = searchParams ? await searchParams : {};

  if (!session?.user?.id) {
    redirect("/sign-in?callbackUrl=/home");
  }

  const memberships = await prisma.membership.findMany({
    where: { userId: session.user.id, isActive: true },
    include: { business: true, tier: true },
    orderBy: { joinedAt: "desc" }
  });

  const totalPoints = memberships.reduce(
    (sum, membership) => sum + membership.pointsBalance,
    0
  );
  const discoverResults = resolvedSearchParams?.q
    ? await discoverBusinesses({ query: resolvedSearchParams.q, limit: 6 })
    : [];

  return (
    <section className="grid gap-5">
      <FlashBanner />
      <Card variant="hero" className="px-6 py-8 sm:px-8">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/70">
          {t("eyebrow")}
        </p>
        <h1 className="mt-3 font-display text-3xl font-extrabold tracking-tight">
          {greeting(
            {
              night: t("greetingNight"),
              morning: t("greetingMorning"),
              afternoon: t("greetingAfternoon"),
              evening: t("greetingEvening")
            },
            session.user.name
          )}
        </h1>
        <p className="mt-2 max-w-lg text-sm text-white/80">
          {memberships.length === 1
            ? t("summarySingle", {
                count: memberships.length,
                points: new Intl.NumberFormat(locale).format(totalPoints)
              })
            : t("summaryPlural", {
                count: memberships.length,
                points: new Intl.NumberFormat(locale).format(totalPoints)
              })}
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <Button asChild variant="gradient">
            <Link href="/wallet">
              {t("openWallet")}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href="/onboard">
              <Plus className="h-4 w-4" />
              {t("onboardBusiness")}
            </Link>
          </Button>
        </div>
      </Card>

      {memberships.length > 0 ? <PushPermissionNudge /> : null}

      <Card variant="surface">
        <form className="flex flex-wrap items-center gap-3">
          <Search className="h-4 w-4 text-ink-subtle" />
          <label htmlFor="home-business-search" className="sr-only">
            {t("searchLabel")}
          </label>
          <input
            id="home-business-search"
            type="search"
            name="q"
            defaultValue={resolvedSearchParams?.q ?? ""}
            placeholder={t("searchPlaceholder")}
            aria-label={t("searchLabel")}
            className="input min-w-[16rem] flex-1 border-0 bg-transparent p-0 outline-none shadow-none"
          />
          <Button type="submit" variant="secondary" size="sm">
            {t("search")}
          </Button>
          <Button asChild variant="secondary" size="sm">
            <Link href="/discover">{t("advancedDiscovery")}</Link>
          </Button>
          <Chip variant="primary" size="sm">
            {t("qrReady")}
          </Chip>
        </form>
      </Card>

      {resolvedSearchParams?.q ? (
        <section className="grid gap-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-xl font-semibold text-ink">{t("discoveryHeading")}</h2>
            <p className="text-sm text-ink-muted">
              {t("discoveryMatches", { count: discoverResults.length })}
            </p>
          </div>
          {discoverResults.length ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {discoverResults.map((business) => (
                <BusinessCard
                  key={business.id}
                  business={{
                    name: business.name,
                    slug: business.slug,
                    category: prettyCategory(business.category),
                    logoUrl: business.logoUrl
                  }}
                  labels={{
                    points: t("pointsLabel"),
                    viewBusiness: t("viewBusiness"),
                    rewards: t("rewards"),
                    openChat: t("openChat")
                  }}
                />
              ))}
            </div>
          ) : (
            <Card variant="outline">
              <p className="text-sm text-ink-muted">
                {t("noResults")}
              </p>
            </Card>
          )}
        </section>
      ) : null}

      {memberships.length ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {memberships.map((membership) => (
            <BusinessCard
              key={membership.id}
              business={{
                name: membership.business.name,
                slug: membership.business.slug,
                category: prettyCategory(membership.business.category),
                logoUrl: membership.business.logoUrl
              }}
              tier={membership.tier ? { name: membership.tier.name } : null}
              points={membership.pointsBalance}
              labels={{
                points: t("pointsLabel"),
                viewBusiness: t("viewBusiness"),
                rewards: t("rewards"),
                openChat: t("openChat")
              }}
            />
          ))}
        </div>
      ) : (
        <Card variant="outline" className="text-center">
          <Sparkles className="mx-auto h-7 w-7 text-primary" />
          <h2 className="mt-3 font-display text-xl font-semibold">
            {t("emptyHeading")}
          </h2>
          <p className="mt-2 text-sm text-ink-muted">
            {t("emptyBody")}
          </p>
        </Card>
      )}
    </section>
  );
}

function greeting(
  labels: {
    night: string;
    morning: string;
    afternoon: string;
    evening: string;
  },
  name?: string | null
): string {
  const hour = new Date().getHours();
  const prefix =
    hour < 5
      ? labels.night
      : hour < 12
        ? labels.morning
        : hour < 17
          ? labels.afternoon
          : labels.evening;
  const first = name?.split(" ")[0];
  return first ? `${prefix}, ${first}` : `${prefix}`;
}

function prettyCategory(category: string): string {
  return category
    .toLowerCase()
    .split("_")
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}
