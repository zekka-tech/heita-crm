import type { Metadata } from "next";
import type { Route } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  BarChart2,
  MessageSquare,
  TrendingDown,
  TrendingUp,
  Users
} from "lucide-react";

import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/badge";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBusinessDashboardAnalytics } from "@/server/services/analytics.service";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Analytics"
};

type AnalyticsPageProps = {
  params: Promise<{ businessId: string }>;
  searchParams?: Promise<{ weeks?: string }>;
};

export default async function AnalyticsPage({
  params,
  searchParams
}: AnalyticsPageProps) {
  const { businessId } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const session = await auth();

  if (!session?.user?.id) {
    redirect(`/sign-in?callbackUrl=/dashboard/${businessId}/analytics`);
  }

  const business = await prisma.business.findFirst({
    where: {
      id: businessId,
      staffMembers: { some: { userId: session.user.id } }
    },
    select: { id: true, name: true }
  });

  if (!business) {
    notFound();
  }

  const rawWeeks = resolvedSearchParams.weeks;
  const weeksOptions = [4, 8, 12, 26] as const;
  type WeeksOption = (typeof weeksOptions)[number];
  const selectedWeeks: WeeksOption = weeksOptions.includes(
    Number(rawWeeks) as WeeksOption
  )
    ? (Number(rawWeeks) as WeeksOption)
    : 8;

  const analytics = await getBusinessDashboardAnalytics({
    businessId,
    weeks: selectedWeeks
  });

  const totalMemberJoins = analytics.series.reduce(
    (sum, bucket) => sum + bucket.memberJoins,
    0
  );
  const totalMessages = analytics.series.reduce(
    (sum, bucket) => sum + bucket.messagesInbound + bucket.messagesOutbound,
    0
  );
  const totalPointsIssued = analytics.series.reduce(
    (sum, bucket) => sum + bucket.pointsIssued,
    0
  );
  const totalPointsRedeemed = analytics.series.reduce(
    (sum, bucket) => sum + bucket.pointsRedeemed,
    0
  );

  const periodLabel =
    selectedWeeks === 4
      ? "Last 4 weeks"
      : selectedWeeks === 12
        ? "Last 12 weeks"
        : selectedWeeks === 26
          ? "Last 6 months"
          : "Last 8 weeks";

  return (
    <main className="px-4 pb-24 pt-6 sm:px-8">
      <div className="grid gap-5">
        <Card variant="hero" className="px-6 py-7 sm:px-10">
          <Chip variant="primary" className="bg-white/15 text-white border-white/20">
            {business.name} · Analytics
          </Chip>
          <h1 className="mt-4 font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
            Analytics
          </h1>
          <p className="mt-2 max-w-2xl text-white/85">
            Member growth, points activity, and conversation volume across your
            business — all in one place.
          </p>
        </Card>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {weeksOptions.map((option) => {
              const label =
                option === 4
                  ? "4 weeks"
                  : option === 12
                    ? "12 weeks"
                    : option === 26
                      ? "6 months"
                      : "8 weeks";
              const active = option === selectedWeeks;
              return (
                <Link
                  key={option}
                  href={
                    `/dashboard/${businessId}/analytics?weeks=${option}` as Route
                  }
                  className={[
                    "rounded-full px-3 py-1 text-xs font-semibold transition-colors",
                    active
                      ? "bg-primary text-white"
                      : "border border-line bg-surface text-ink-muted hover:text-ink"
                  ].join(" ")}
                >
                  {label}
                </Link>
              );
            })}
          </div>
          <Chip variant="default" size="sm">
            {periodLabel}
          </Chip>
        </div>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            icon={Users}
            label="New members"
            value={totalMemberJoins.toLocaleString()}
            sub={periodLabel}
            colorClass="text-primary-action"
          />
          <KpiCard
            icon={TrendingUp}
            label="Points issued"
            value={analytics.kpis.pointsIssued30d.toLocaleString()}
            sub="Last 30 days"
            colorClass="text-success"
          />
          <KpiCard
            icon={TrendingDown}
            label="Points redeemed"
            value={analytics.kpis.pointsRedeemed30d.toLocaleString()}
            sub="Last 30 days"
            colorClass="text-warning"
          />
          <KpiCard
            icon={MessageSquare}
            label="Outbound replies"
            value={analytics.kpis.outbound30d.toLocaleString()}
            sub="Last 30 days"
            colorClass="text-accent"
          />
        </section>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-line bg-surface-elevated px-4 py-3">
            <p className="metric-label">Redemption rate (30d)</p>
            <p className="mt-2 font-display text-xl font-semibold text-ink">
              {Math.round(analytics.kpis.redemptionRate30d * 100)}%
            </p>
          </div>
          <div className="rounded-xl border border-line bg-surface-elevated px-4 py-3">
            <p className="metric-label">Inbound messages (30d)</p>
            <p className="mt-2 font-display text-xl font-semibold text-ink">
              {analytics.kpis.inbound30d.toLocaleString()}
            </p>
          </div>
          <div className="rounded-xl border border-line bg-surface-elevated px-4 py-3">
            <p className="metric-label">Total points issued ({periodLabel.toLowerCase()})</p>
            <p className="mt-2 font-display text-xl font-semibold text-ink">
              {totalPointsIssued.toLocaleString()}
            </p>
          </div>
          <div className="rounded-xl border border-line bg-surface-elevated px-4 py-3">
            <p className="metric-label">Total messages ({periodLabel.toLowerCase()})</p>
            <p className="mt-2 font-display text-xl font-semibold text-ink">
              {totalMessages.toLocaleString()}
            </p>
          </div>
        </section>

        <Card variant="surface" className="space-y-4">
          <header className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary-action" />
              <h2 className="section-title">Member growth</h2>
            </div>
            <Chip variant="primary" size="sm">
              {totalMemberJoins} joins
            </Chip>
          </header>
          <Sparkline
            values={analytics.series.map((bucket) => bucket.memberJoins)}
            labels={analytics.series.map((bucket) => bucket.label)}
            colorClassName="bg-primary"
          />
        </Card>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card variant="surface" className="space-y-4">
            <header className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-success" />
                <h2 className="section-title">Points issued</h2>
              </div>
              <Chip variant="success" size="sm">
                {totalPointsIssued.toLocaleString()} pts
              </Chip>
            </header>
            <Sparkline
              values={analytics.series.map((bucket) => bucket.pointsIssued)}
              labels={analytics.series.map((bucket) => bucket.label)}
              colorClassName="bg-success"
            />
          </Card>

          <Card variant="surface" className="space-y-4">
            <header className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingDown className="h-5 w-5 text-warning" />
                <h2 className="section-title">Points redeemed</h2>
              </div>
              <Chip variant="warning" size="sm">
                {totalPointsRedeemed.toLocaleString()} pts
              </Chip>
            </header>
            <Sparkline
              values={analytics.series.map((bucket) => bucket.pointsRedeemed)}
              labels={analytics.series.map((bucket) => bucket.label)}
              colorClassName="bg-warning"
            />
          </Card>
        </div>

        <Card variant="surface" className="space-y-4">
          <header className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-primary-action" />
              <h2 className="section-title">Conversation volume</h2>
            </div>
            <Chip variant="default" size="sm">
              {totalMessages.toLocaleString()} messages
            </Chip>
          </header>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="grid gap-2">
              <p className="metric-label">Inbound</p>
              <Sparkline
                values={analytics.series.map((bucket) => bucket.messagesInbound)}
                labels={analytics.series.map((bucket) => bucket.label)}
                colorClassName="bg-accent"
              />
            </div>
            <div className="grid gap-2">
              <p className="metric-label">Outbound</p>
              <Sparkline
                values={analytics.series.map(
                  (bucket) => bucket.messagesOutbound
                )}
                labels={analytics.series.map((bucket) => bucket.label)}
                colorClassName="bg-primary"
              />
            </div>
          </div>
        </Card>

        <div className="flex justify-end">
          <Link
            href={`/dashboard/${businessId}` as Route}
            className="text-sm text-ink-muted underline hover:text-ink"
          >
            Back to dashboard overview
          </Link>
        </div>
      </div>
    </main>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  colorClass
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub: string;
  colorClass: string;
}) {
  return (
    <Card variant="outline" className="space-y-2">
      <div className="flex items-center justify-between">
        <Icon className={`h-4 w-4 ${colorClass}`} />
        <span className="metric-label">{label}</span>
      </div>
      <p className="metric-value">{value}</p>
      <p className="text-[0.6875rem] text-ink-subtle">{sub}</p>
    </Card>
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
