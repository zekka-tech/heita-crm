import type { Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import {
  Building2,
  Calendar,
  Gift,
  MapPin,
  MessageSquare,
  Sparkles,
  Tag
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/badge";
import { Breadcrumb } from "@/components/shared/breadcrumb";
import { auth } from "@/lib/auth";
import { describeTierPerks } from "@/lib/loyalty";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type BusinessLandingPageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: BusinessLandingPageProps) {
  const { slug } = await params;
  const business = await prisma.business.findFirst({
    where: { slug, deletedAt: null },
    select: { name: true, description: true }
  });

  if (!business) return { title: "Business" };

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://heita.co.za";
  const desc =
    business.description ??
    `Join ${business.name} on Heita to earn loyalty points and special offers.`;

  return {
    title: business.name,
    description: desc,
    alternates: {
      languages: {
        "en-ZA": `${appUrl}/b/${slug}`,
        zu: `${appUrl}/b/${slug}`,
        xh: `${appUrl}/b/${slug}`,
        af: `${appUrl}/b/${slug}`
      }
    },
    openGraph: {
      title: business.name,
      description: desc,
      images: [`${appUrl}/api/og/${slug}`]
    }
  };
}

export default async function BusinessLandingPage({
  params
}: BusinessLandingPageProps) {
  const t = await getTranslations("businessProfile");
  const { slug } = await params;
  const business = await prisma.business.findFirst({
    where: { slug, deletedAt: null },
    include: {
      rewards: { where: { isActive: true }, orderBy: { pointsCost: "asc" }, take: 3 },
      promotions: {
        where: { isActive: true, endsAt: { gt: new Date() } },
        orderBy: { endsAt: "asc" },
        take: 3
      },
      events: {
        where: { startsAt: { gte: new Date() } },
        orderBy: { startsAt: "asc" },
        take: 3
      },
      loyaltyTiers: { orderBy: { minPoints: "asc" } }
    }
  });

  if (!business) {
    notFound();
  }

  const session = await auth();
  const membership = session?.user?.id
    ? await prisma.membership.findUnique({
        where: {
          businessId_userId: {
            businessId: business.id,
            userId: session.user.id
          }
        },
        include: { tier: true }
      })
    : null;

  return (
    <main className="px-4 pb-24 pt-6 sm:px-8">
      <Breadcrumb
        crumbs={[
          { label: "Discover", href: "/discover" },
          { label: business.name }
        ]}
        className="mb-4"
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify([
            {
              "@context": "https://schema.org",
              "@type": "LocalBusiness",
              name: business.name,
              description: business.description ?? undefined,
              image: business.logoUrl ?? undefined,
              telephone: business.phone ?? undefined,
              email: business.email ?? undefined,
              address: business.city
                ? {
                    "@type": "PostalAddress",
                    streetAddress: business.addressLine1 ?? undefined,
                    addressLocality: business.city,
                    addressRegion: prettyProvince(business.province),
                    postalCode: business.postalCode ?? undefined,
                    addressCountry: "ZA"
                  }
                : undefined,
              url: `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/b/${business.slug}`
            },
            ...business.rewards.map((r) => ({
              "@context": "https://schema.org",
              "@type": "Offer",
              name: r.title,
              description: r.description ?? undefined,
              seller: { "@type": "LocalBusiness", name: business.name }
            })),
            ...business.events.map((e) => ({
              "@context": "https://schema.org",
              "@type": "Event",
              name: e.title,
              description: e.description ?? undefined,
              startDate: e.startsAt.toISOString(),
              endDate: e.endsAt?.toISOString() ?? undefined,
              location: e.location
                ? { "@type": "Place", name: e.location }
                : { "@type": "VirtualLocation" },
              organizer: { "@type": "LocalBusiness", name: business.name }
            }))
          ])
        }}
      />
      <section className="surface-hero relative overflow-hidden px-6 py-10 sm:px-12">
        <div className="grid items-center gap-8 lg:grid-cols-[1.4fr_0.6fr]">
          <div>
            <Chip variant="primary" className="bg-white/15 text-white border-white/20">
              <Building2 className="h-3.5 w-3.5" />
              {prettyCategory(business.category)} · {prettyProvince(business.province)}
            </Chip>
            <h1 className="mt-5 font-display text-4xl font-extrabold tracking-tight sm:text-5xl">
              {business.name}
            </h1>
            <p className="mt-4 max-w-2xl text-white/85">
              {business.description ||
                `Join the loyalty programme at ${business.name} to earn points, unlock rewards, and stay in touch.`}
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button asChild variant="gradient" size="lg">
                <Link
                  href={
                    membership
                      ? (`/b/${slug}/rewards` as Route)
                      : (`/b/${slug}/join` as Route)
                  }
                >
                  {membership
                    ? t("viewRewards")
                    : t("joinWithBonus", {
                        points: business.loyaltySignupBonus
                      })}
                </Link>
              </Button>
              <Button asChild variant="secondary" size="lg">
                <Link href={`/b/${slug}/chat` as Route}>
                  <MessageSquare className="h-4 w-4" />
                  {t("talkToTeam")}
                </Link>
              </Button>
            </div>
            {business.addressLine1 || business.suburb || business.city ? (
              <p className="mt-4 inline-flex items-center gap-2 text-sm text-white/75">
                <MapPin className="h-4 w-4" />
                {[business.addressLine1, business.suburb, business.city]
                  .filter(Boolean)
                  .join(", ")}
              </p>
            ) : null}
          </div>

          <div className="surface-glass rounded-2xl p-6 text-ink shadow-xl">
            {membership ? (
              <>
                <p className="eyebrow text-primary-action">{t("yourMembership")}</p>
                <p className="metric-value mt-3">
                  {membership.pointsBalance.toLocaleString()}
                </p>
                <p className="metric-label">{t("pointsLabel")}</p>
                <p className="mt-4 text-sm text-ink-muted">
                  {t("currentTier")}{" "}
                  <span className="font-semibold text-ink">
                    {membership.tier?.name ?? t("unranked")}
                  </span>
                </p>
              </>
            ) : (
              <>
                <p className="eyebrow text-primary-action">{t("freeToJoin")}</p>
                <p className="metric-value mt-3">
                  {business.loyaltySignupBonus}
                </p>
                <p className="metric-label">{t("welcomePoints")}</p>
                <p className="mt-4 text-sm text-ink-muted">
                  {t("joinPrompt")}
                </p>
              </>
            )}
          </div>
        </div>
      </section>

      <section className="mt-8 grid gap-4 md:grid-cols-3">
        <SummarySection
          icon={Gift}
          title={t("rewards")}
          empty={t("noRewards")}
          items={business.rewards.map((reward) => ({
            label: reward.title,
            meta: `${reward.pointsCost} pts`
          }))}
        />
        <SummarySection
          icon={Tag}
          title={t("promotions")}
          empty={t("noPromotions")}
          items={business.promotions.map((promotion) => ({
            label: promotion.title,
            meta: prettyPromo(promotion.type)
          }))}
        />
        <SummarySection
          icon={Calendar}
          title={t("upcomingEvents")}
          empty={t("noEvents")}
          items={business.events.map((event) => ({
            label: event.title,
            meta: event.startsAt.toLocaleDateString("en-ZA", {
              day: "2-digit",
              month: "short"
            })
          }))}
        />
      </section>

      {business.loyaltyTiers.length ? (
        <section className="mt-6">
          <Card variant="outline">
            <header className="flex items-center justify-between">
              <h2 className="section-title">{t("loyaltyTiers")}</h2>
              <Chip variant="primary" size="sm">
                <Sparkles className="h-3 w-3" />
                {t("earnFaster")}
              </Chip>
            </header>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {business.loyaltyTiers.map((tier) => (
                <div
                  key={tier.id}
                  className="rounded-xl border border-line bg-surface-elevated p-4"
                >
                  <p className="font-display text-lg font-semibold text-ink">
                    {tier.name}
                  </p>
                  <p className="metric-label">{tier.minPoints}+ pts</p>
                  {describeTierPerks(tier.perks).length ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {describeTierPerks(tier.perks).map((perk) => (
                        <Chip key={`${tier.id}-${perk}`} variant="primary" size="sm">
                          {perk}
                        </Chip>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </Card>
        </section>
      ) : null}
    </main>
  );
}

function SummarySection({
  icon: Icon,
  title,
  items,
  empty
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  items: { label: string; meta: string }[];
  empty: string;
}) {
  return (
    <Card variant="surface" className="space-y-4">
      <div className="flex items-center gap-2">
        <Icon className="h-5 w-5 text-primary-action" />
        <h2 className="font-display text-base font-semibold text-ink">{title}</h2>
      </div>
      {items.length ? (
        <ul className="space-y-2 text-sm">
          {items.map(({ label, meta }) => (
            <li
              key={`${title}-${label}`}
              className="flex items-center justify-between gap-3 rounded-xl bg-surface-elevated px-3 py-2"
            >
              <span className="truncate font-medium text-ink">{label}</span>
              <span className="text-xs font-semibold uppercase tracking-wider text-ink-subtle">
                {meta}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-ink-muted">{empty}</p>
      )}
    </Card>
  );
}

function prettyCategory(category: string) {
  return category
    .toLowerCase()
    .split("_")
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function prettyProvince(province: string) {
  return prettyCategory(province);
}

function prettyPromo(type: string) {
  return type
    .toLowerCase()
    .split("_")
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}
