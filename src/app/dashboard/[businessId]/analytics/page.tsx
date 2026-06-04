import type { Metadata } from "next";
import type { Route } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  Activity,
  Gift,
  MessageSquare,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";

import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/badge";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBusinessDashboardAnalytics } from "@/server/services/analytics.service";
import {
  MemberGrowthChart,
  PointsActivityChart,
  MessagesChart,
  TopRewardsTable,
} from "@/components/analytics/charts-loader";

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
      deletedAt: null,
      staffMembers: { some: { userId: session.user.id } }
    },
    select: { id: true, name: true }
  });

  if (!business) {
    notFound();
  }

  const weeksOptions = [4, 8, 12, 26] as const;
  type WeeksOption = (typeof weeksOptions)[number];
  const rawWeeks = resolvedSearchParams.weeks;
  const selectedWeeks: WeeksOption = weeksOptions.includes(
    Number(rawWeeks) as WeeksOption
  )
    ? (Number(rawWeeks) as WeeksOption)
    : 8;

  const analytics = await getBusinessDashboardAnalytics({
    businessId,
    weeks: selectedWeeks
  });

  const totalMemberJoins = analytics.series.reduce((s, b) => s + b.memberJoins, 0);
  const totalMessages = analytics.series.reduce(
    (s, b) => s + b.messagesInbound + b.messagesOutbound,
    0
  );
  const totalPointsIssued = analytics.series.reduce((s, b) => s + b.pointsIssued, 0);
  const totalPointsRedeemed = analytics.series.reduce((s, b) => s + b.pointsRedeemed, 0);

  const periodLabel =
    selectedWeeks === 4
      ? "Last 4 weeks"
      : selectedWeeks === 12
        ? "Last 12 weeks"
        : selectedWeeks === 26
          ? "Last 6 months"
          : "Last 8 weeks";

  const { kpis, topRewards } = analytics;

  return (
    <main className="px-4 pb-24 pt-6 sm:px-8">
      <div className="grid gap-5">

        {/* Hero */}
        <Card variant="hero" className="px-6 py-7 sm:px-10">
          <Chip variant="primary" className="bg-white/15 text-white border-white/20">
            {business.name} · Analytics
          </Chip>
          <h1 className="mt-4 font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
            Analytics
          </h1>
          <p className="mt-2 max-w-2xl text-white/85">
            Member growth, loyalty activity, and conversation volume — all in one place.
          </p>
        </Card>

        {/* Period selector */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {weeksOptions.map((option) => {
              const label =
                option === 4 ? "4 weeks" : option === 12 ? "12 weeks" : option === 26 ? "6 months" : "8 weeks";
              const active = option === selectedWeeks;
              return (
                <Link
                  key={option}
                  href={`/dashboard/${businessId}/analytics?weeks=${option}` as Route}
                  className={[
                    "rounded-full px-3 py-1 text-xs font-semibold transition-colors",
                    active
                      ? "bg-primary text-white"
                      : "border border-line bg-surface text-ink-muted hover:text-ink",
                  ].join(" ")}
                >
                  {label}
                </Link>
              );
            })}
          </div>
          <Chip variant="default" size="sm">{periodLabel}</Chip>
        </div>

        {/* Primary KPIs */}
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard icon={Users} label="New members" value={totalMemberJoins.toLocaleString()} sub={periodLabel} colorClass="text-primary-action" />
          <KpiCard icon={TrendingUp} label="Points issued" value={kpis.pointsIssued30d.toLocaleString()} sub="Last 30 days" colorClass="text-success" />
          <KpiCard icon={TrendingDown} label="Points redeemed" value={kpis.pointsRedeemed30d.toLocaleString()} sub="Last 30 days" colorClass="text-warning" />
          <KpiCard icon={MessageSquare} label="Outbound replies" value={kpis.outbound30d.toLocaleString()} sub="Last 30 days" colorClass="text-accent" />
        </section>

        {/* Secondary KPIs — engagement health */}
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile label="Redemption rate (30d)" value={`${Math.round(kpis.redemptionRate30d * 100)}%`} />
          <StatTile label="Inbound messages (30d)" value={kpis.inbound30d.toLocaleString()} />
          <StatTile label={`Points issued (${periodLabel.toLowerCase()})`} value={totalPointsIssued.toLocaleString()} />
          <StatTile label={`Messages (${periodLabel.toLowerCase()})`} value={totalMessages.toLocaleString()} />
        </section>

        {/* Engagement health — new KPIs */}
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            icon={Activity}
            label="Active members (90d)"
            value={kpis.activeMembersLast90d.toLocaleString()}
            sub={`${Math.round(kpis.activeMemberRate90d * 100)}% of ${kpis.totalMembers.toLocaleString()} total`}
            colorClass="text-teal-500"
          />
          <KpiCard
            icon={Wallet}
            label="Points liability"
            value={kpis.pointsLiability.toLocaleString()}
            sub="Outstanding balance across all members"
            colorClass="text-primary-action"
          />
          <KpiCard
            icon={TrendingDown}
            label="Dormant members"
            value={(kpis.totalMembers - kpis.activeMembersLast90d).toLocaleString()}
            sub="No activity in 90 days"
            colorClass="text-ink-muted"
          />
          <KpiCard
            icon={Gift}
            label={`Points redeemed (${periodLabel.toLowerCase()})`}
            value={totalPointsRedeemed.toLocaleString()}
            sub={`of ${totalPointsIssued.toLocaleString()} issued`}
            colorClass="text-warning"
          />
        </section>

        {/* Member growth chart */}
        <Card variant="surface" className="space-y-4">
          <header className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary-action" />
              <h2 className="section-title">Member growth</h2>
            </div>
            <Chip variant="primary" size="sm">{totalMemberJoins} joins</Chip>
          </header>
          <MemberGrowthChart series={analytics.series} />
        </Card>

        {/* Points activity + messages */}
        <div className="grid gap-4 lg:grid-cols-2">
          <Card variant="surface" className="space-y-4">
            <header className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-success" />
                <h2 className="section-title">Points activity</h2>
              </div>
              <Chip variant="success" size="sm">{totalPointsIssued.toLocaleString()} issued</Chip>
            </header>
            <PointsActivityChart series={analytics.series} />
          </Card>

          <Card variant="surface" className="space-y-4">
            <header className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-primary-action" />
                <h2 className="section-title">Conversation volume</h2>
              </div>
              <Chip variant="default" size="sm">{totalMessages.toLocaleString()} messages</Chip>
            </header>
            <MessagesChart series={analytics.series} />
          </Card>
        </div>

        {/* Top rewards */}
        <Card variant="surface" className="space-y-4">
          <header className="flex items-center gap-2">
            <Gift className="h-5 w-5 text-warning" />
            <h2 className="section-title">Top rewards by redemptions</h2>
          </header>
          <TopRewardsTable rewards={topRewards} />
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

// ─── Shared UI primitives ─────────────────────────────────────────────────────

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  colorClass,
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

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface-elevated px-4 py-3">
      <p className="metric-label">{label}</p>
      <p className="mt-2 font-display text-xl font-semibold text-ink">{value}</p>
    </div>
  );
}

