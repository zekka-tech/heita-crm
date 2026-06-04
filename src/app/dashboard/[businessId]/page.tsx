import type { Route } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import {
  Building2,
  Calendar,
  Gift,
  LineChart,
  Megaphone,
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
  const [session, t] = await Promise.all([
    auth(),
    getTranslations("dashboard")
  ]);

  if (!session?.user?.id) {
    redirect(`/sign-in?callbackUrl=/dashboard/${businessId}`);
  }

  const last30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [business, recentMembers, pointsAgg] = await Promise.all([
    prisma.business.findFirst({
      where: {
        id: businessId,
        deletedAt: null,
        staffMembers: { some: { userId: session.user.id } }
      },
      select: {
        id: true,
        name: true,
        slug: true,
        whatsappPhoneNumber: true,
        qrCodes: {
          select: { token: true },
          orderBy: { createdAt: "asc" },
          take: 1
        },
        joinLinks: {
          select: { token: true },
          orderBy: { createdAt: "asc" },
          take: 1
        },
        events: {
          select: { id: true, title: true, startsAt: true },
          where: { startsAt: { gte: new Date() } },
          orderBy: { startsAt: "asc" },
          take: 3
        },
        _count: {
          select: {
            memberships: true,
            messages: true,
            rewards: true,
            loyaltyTransactions: true,
            staffMembers: true,
            documents: true
          }
        }
      }
    }),
    // Members who joined in the last 30 days — avoids loading all membership rows.
    prisma.membership.count({
      where: { businessId, joinedAt: { gte: last30 } }
    }),
    // Current outstanding points balance (sum across all members).
    prisma.membership.aggregate({
      where: { businessId },
      _sum: { pointsBalance: true }
    }),
  ]);

  if (!business) {
    notFound();
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const primaryQr = business.qrCodes[0] ?? null;
  const primaryLink = business.joinLinks[0] ?? null;
  const totalPointsOutstanding = pointsAgg._sum.pointsBalance ?? 0;

  return (
    <main className="px-4 pb-24 pt-6 sm:px-8">
      {/* Hero — renders immediately */}
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
            <Button asChild variant="secondary">
              <Link href={`/dashboard/${businessId}/promotions` as Route}>
                <Megaphone className="h-4 w-4" />
                {t("promotions")}
              </Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href={`/dashboard/${businessId}/events` as Route}>
                <Calendar className="h-4 w-4" />
                {t("events")}
              </Link>
            </Button>
          </div>
        </div>
      </Card>

      {/* Fast metrics from business._count — renders immediately */}
      <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric icon={Users} label={t("members")} value={business._count.memberships} />
        <Metric icon={Sparkles} label={t("new30d")} value={recentMembers} />
        <Metric icon={Gift} label={t("activeRewards")} value={business._count.rewards} />
        <Metric
          icon={LineChart}
          label={t("pointsOutstanding")}
          value={totalPointsOutstanding.toLocaleString()}
        />
      </section>

      {(business._count.rewards === 0 ||
        business._count.documents === 0 ||
        business._count.staffMembers <= 1 ||
        !business.whatsappPhoneNumber) ? (
        <Card variant="surface" className="mt-6 space-y-3">
          <header>
            <h2 className="section-title">{t("setupChecklist")}</h2>
            <p className="text-sm text-ink-muted">{t("setupChecklistBlurb")}</p>
          </header>
          <ul className="grid gap-2">
            {business._count.rewards === 0 ? (
              <li>
                <Link href={`/dashboard/${businessId}/loyalty` as Route} className="flex items-center gap-3 rounded-xl border border-warning/30 bg-warning/5 px-4 py-3 text-sm text-ink hover:bg-warning/10">
                  <Gift className="h-4 w-4 shrink-0 text-warning" />
                  <span className="font-medium">Create your first reward</span>
                </Link>
              </li>
            ) : null}
            {business._count.documents === 0 ? (
              <li>
                <Link href={`/dashboard/${businessId}/ai-workspace` as Route} className="flex items-center gap-3 rounded-xl border border-warning/30 bg-warning/5 px-4 py-3 text-sm text-ink hover:bg-warning/10">
                  <Sparkles className="h-4 w-4 shrink-0 text-warning" />
                  <span className="font-medium">Upload a document to train your AI assistant</span>
                </Link>
              </li>
            ) : null}
            {business._count.staffMembers <= 1 ? (
              <li>
                <Link href={`/dashboard/${businessId}/settings/staff` as Route} className="flex items-center gap-3 rounded-xl border border-warning/30 bg-warning/5 px-4 py-3 text-sm text-ink hover:bg-warning/10">
                  <Users className="h-4 w-4 shrink-0 text-warning" />
                  <span className="font-medium">Invite a team member</span>
                </Link>
              </li>
            ) : null}
            {!business.whatsappPhoneNumber ? (
              <li>
                <Link href={`/dashboard/${businessId}/settings` as Route} className="flex items-center gap-3 rounded-xl border border-warning/30 bg-warning/5 px-4 py-3 text-sm text-ink hover:bg-warning/10">
                  <MessageSquare className="h-4 w-4 shrink-0 text-warning" />
                  <span className="font-medium">Connect your WhatsApp Business number</span>
                </Link>
              </li>
            ) : null}
          </ul>
        </Card>
      ) : null}

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
                {primaryLink ? `${baseUrl}/join/${primaryLink.token}` : t("notConfigured")}
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

      {/* Analytics section streams in independently — skeleton shown until ready */}
      <section className="mt-6">
        <Suspense fallback={<AnalyticsSkeleton businessId={businessId} t={t} messageCount={business._count.messages} txCount={business._count.loyaltyTransactions} />}>
          <AnalyticsSection businessId={businessId} messageCount={business._count.messages} txCount={business._count.loyaltyTransactions} />
        </Suspense>
      </section>
    </main>
  );
}

async function AnalyticsSection({
  businessId,
  messageCount,
  txCount
}: {
  businessId: string;
  messageCount: number;
  txCount: number;
}) {
  const [analytics, t] = await Promise.all([
    getBusinessDashboardAnalytics({ businessId }),
    getTranslations("dashboard")
  ]);

  return (
    <Card variant="surface" className="space-y-3">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-primary-action" />
          <h2 className="font-display text-base font-semibold text-ink">
            {t("activityAtGlance")}
          </h2>
        </div>
        <Link
          href={`/dashboard/${businessId}/analytics` as Route}
          className="text-sm font-medium text-primary-action hover:underline"
        >
          {t("viewFullAnalytics")} →
        </Link>
      </header>
      <p className="text-sm text-ink-muted">
        {t("activitySummary", { messages: messageCount, transactions: txCount })}
      </p>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="grid gap-2">
          <p className="metric-label">{t("weeklyMemberGrowth")}</p>
          <Sparkline
            values={analytics.series.map((b) => b.memberJoins)}
            labels={analytics.series.map((b) => b.label)}
            colorClassName="bg-primary"
          />
        </div>
        <div className="grid gap-2">
          <p className="metric-label">{t("weeklyConversationVolume")}</p>
          <Sparkline
            values={analytics.series.map((b) => b.messagesInbound + b.messagesOutbound)}
            labels={analytics.series.map((b) => b.label)}
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
  );
}

function AnalyticsSkeleton({
  businessId,
  t,
  messageCount,
  txCount
}: {
  businessId: string;
  t: Awaited<ReturnType<typeof getTranslations<"dashboard">>>;
  messageCount: number;
  txCount: number;
}) {
  return (
    <Card variant="surface" className="space-y-3">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-primary-action" />
          <h2 className="font-display text-base font-semibold text-ink">
            {t("activityAtGlance")}
          </h2>
        </div>
        <Link
          href={`/dashboard/${businessId}/analytics` as Route}
          className="text-sm font-medium text-primary-action hover:underline"
        >
          {t("viewFullAnalytics")} →
        </Link>
      </header>
      <p className="text-sm text-ink-muted">
        {t("activitySummary", { messages: messageCount, transactions: txCount })}
      </p>
      <div className="grid gap-4 lg:grid-cols-2">
        {[0, 1].map((i) => (
          <div key={i} className="grid gap-2">
            <div className="h-4 w-32 animate-pulse rounded bg-surface-elevated" />
            <div className="h-40 animate-pulse rounded-xl bg-surface-elevated" />
          </div>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-xl border border-line bg-surface-elevated px-4 py-3">
            <div className="h-3 w-20 animate-pulse rounded bg-surface" />
            <div className="mt-2 h-6 w-12 animate-pulse rounded bg-surface" />
          </div>
        ))}
      </div>
    </Card>
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

function Sparkline(input: { values: number[]; labels: string[]; colorClassName: string }) {
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
