import type { Route } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import {
  Building2,
  Calendar,
  Gift,
  LineChart,
  MessageSquare,
  QrCode,
  Sparkles,
  Users
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/badge";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBusinessDashboardAnalytics } from "@/server/services/analytics.service";

export const dynamic = "force-dynamic";

type DashboardPageProps = {
  params: Promise<{ businessId: string }>;
};

export default async function DashboardPage({ params }: DashboardPageProps) {
  const { businessId } = await params;
  const session = await auth();
  const t = await getTranslations("dashboard");

  if (!session?.user?.id) {
    redirect(`/sign-in?callbackUrl=/dashboard/${businessId}`);
  }

  const business = await prisma.business.findFirst({
    where: {
      id: businessId,
      staffMembers: { some: { userId: session.user.id } }
    },
    include: {
      qrCodes: { orderBy: { createdAt: "asc" }, take: 1 },
      joinLinks: { orderBy: { createdAt: "asc" }, take: 1 },
      memberships: { select: { id: true, joinedAt: true, pointsBalance: true } },
      rewards: { select: { id: true } },
      events: {
        where: { startsAt: { gte: new Date() } },
        orderBy: { startsAt: "asc" },
        take: 3
      },
      _count: {
        select: {
          memberships: true,
          messages: true,
          rewards: true,
          loyaltyTransactions: true
        }
      }
    }
  });

  if (!business) {
    notFound();
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const primaryQr = business.qrCodes[0] ?? null;
  const primaryLink = business.joinLinks[0] ?? null;
  const analytics = await getBusinessDashboardAnalytics({ businessId });

  const last30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const recentMembers = business.memberships.filter(
    (m) => m.joinedAt.getTime() >= last30.getTime()
  ).length;
  const totalPointsIssued = business.memberships.reduce(
    (sum, m) => sum + m.pointsBalance,
    0
  );

  return (
    <main className="px-4 pb-24 pt-6 sm:px-8">
      <Card variant="hero" className="px-6 py-8 sm:px-10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Chip variant="primary" className="bg-white/15 text-white border-white/20">
              <Building2 className="h-3.5 w-3.5" />
              {t("chipPrefix")} · {business.slug}
            </Chip>
            <h1 className="mt-4 font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
              {business.name}
            </h1>
            <p className="mt-2 text-white/85">{t("heroBlurb")}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="gradient">
              <Link href={`/dashboard/${businessId}/loyalty` as Route}>
                <Gift className="h-4 w-4" />
                {t("loyaltyControls")}
              </Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href={`/dashboard/${businessId}/ai-workspace` as Route}>
                <Sparkles className="h-4 w-4" />
                {t("aiWorkspace")}
              </Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href={`/dashboard/${businessId}/messages` as Route}>
                <MessageSquare className="h-4 w-4" />
                {t("conversations")}
              </Link>
            </Button>
          </div>
        </div>
      </Card>

      <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric icon={Users} label={t("members")} value={business._count.memberships} />
        <Metric
          icon={Sparkles}
          label={t("new30d")}
          value={recentMembers}
        />
        <Metric icon={Gift} label={t("activeRewards")} value={business._count.rewards} />
        <Metric
          icon={LineChart}
          label={t("pointsOutstanding")}
          value={totalPointsIssued.toLocaleString()}
        />
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card variant="surface" className="space-y-3 lg:col-span-2">
          <header className="flex items-center justify-between">
            <h2 className="section-title">{t("shareAndOnboard")}</h2>
            <Chip variant="primary" size="sm">
              <QrCode className="h-3 w-3" /> {t("primaryChannels")}
            </Chip>
          </header>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-line bg-surface-elevated p-4">
              <p className="metric-label">{t("publicProfile")}</p>
              <Link
                href={`/b/${business.slug}` as Route}
                className="mt-2 block break-all text-sm font-medium text-primary-action underline"
              >
                {baseUrl}/b/{business.slug}
              </Link>
            </div>
            <div className="rounded-xl border border-line bg-surface-elevated p-4">
              <p className="metric-label">{t("primaryJoinLink")}</p>
              <p className="mt-2 break-all text-sm text-ink">
                {primaryLink
                  ? `${baseUrl}/join/${primaryLink.token}`
                  : t("notConfigured")}
              </p>
            </div>
            <div className="rounded-xl border border-line bg-surface-elevated p-4">
              <p className="metric-label">{t("qrAsset")}</p>
              <p className="mt-2 break-all text-sm text-ink">
                {primaryQr ? `${baseUrl}/api/qr/${primaryQr.token}` : t("notConfigured")}
              </p>
            </div>
            <div className="rounded-xl border border-line bg-surface-elevated p-4">
              <p className="metric-label">{t("whatsappNumber")}</p>
              <p className="mt-2 text-sm text-ink">
                {business.whatsappPhoneNumber ?? t("notConnected")}
              </p>
            </div>
          </div>
        </Card>

        <Card variant="surface" className="space-y-4">
          <header className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary-action" />
            <h2 className="font-display text-base font-semibold text-ink">
              {t("upcomingEvents")}
            </h2>
          </header>
          {business.events.length ? (
            <ul className="space-y-2">
              {business.events.map((event) => (
                <li
                  key={event.id}
                  className="rounded-xl border border-line bg-surface-elevated px-3 py-2"
                >
                  <p className="font-medium text-ink">{event.title}</p>
                  <p className="text-xs text-ink-subtle">
                    {event.startsAt.toLocaleString("en-ZA")}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-muted">{t("noEvents")}</p>
          )}
        </Card>
      </section>

      <section className="mt-6">
        <Card variant="surface" className="space-y-3">
          <header className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary-action" />
            <h2 className="font-display text-base font-semibold text-ink">
              {t("activityAtGlance")}
            </h2>
          </header>
          <p className="text-sm text-ink-muted">
            {t("activitySummary", {
              messages: business._count.messages,
              transactions: business._count.loyaltyTransactions
            })}
          </p>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="grid gap-2">
              <p className="metric-label">{t("weeklyMemberGrowth")}</p>
              <Sparkline
                values={analytics.series.map((bucket) => bucket.memberJoins)}
                labels={analytics.series.map((bucket) => bucket.label)}
                colorClassName="bg-primary"
              />
            </div>
            <div className="grid gap-2">
              <p className="metric-label">{t("weeklyConversationVolume")}</p>
              <Sparkline
                values={analytics.series.map(
                  (bucket) => bucket.messagesInbound + bucket.messagesOutbound
                )}
                labels={analytics.series.map((bucket) => bucket.label)}
                colorClassName="bg-accent"
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MiniMetric
              label={t("pointsIssued30d")}
              value={analytics.kpis.pointsIssued30d.toLocaleString()}
            />
            <MiniMetric
              label={t("pointsRedeemed30d")}
              value={analytics.kpis.pointsRedeemed30d.toLocaleString()}
            />
            <MiniMetric
              label={t("redemptionRate")}
              value={`${Math.round(analytics.kpis.redemptionRate30d * 100)}%`}
            />
            <MiniMetric
              label={t("repliesSent30d")}
              value={analytics.kpis.outbound30d.toLocaleString()}
            />
          </div>
        </Card>
      </section>
    </main>
  );
}

function Metric({
  icon: Icon,
  label,
  value
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | string;
}) {
  return (
    <Card variant="outline" className="space-y-2">
      <div className="flex items-center justify-between">
        <Icon className="h-4 w-4 text-primary-action" />
        <span className="metric-label">{label}</span>
      </div>
      <p className="metric-value">{value}</p>
    </Card>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface-elevated px-4 py-3">
      <p className="metric-label">{label}</p>
      <p className="mt-2 font-display text-xl font-semibold text-ink">{value}</p>
    </div>
  );
}

function Sparkline(input: {
  values: number[];
  labels: string[];
  colorClassName: string;
}) {
  const max = Math.max(...input.values, 1);

  return (
    <div className="flex items-end gap-2 rounded-xl border border-line bg-surface-elevated px-4 py-4">
      {input.values.map((value, index) => (
        <div key={input.labels[index]} className="flex flex-1 flex-col items-center gap-2">
          <div className="flex h-28 w-full items-end rounded-lg bg-surface">
            <div
              className={`${input.colorClassName} w-full rounded-lg`}
              style={{ height: `${Math.max(8, (value / max) * 100)}%` }}
              title={`${input.labels[index]}: ${value}`}
            />
          </div>
          <span className="text-[10px] uppercase tracking-[0.12em] text-ink-subtle">
            {input.labels[index]}
          </span>
        </div>
      ))}
    </div>
  );
}
