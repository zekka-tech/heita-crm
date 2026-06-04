"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { TopReward } from "@/server/services/analytics.service";

// Design token hex values (mirrors globals.css; kept explicit so Recharts
// colour props — which don't read CSS variables — stay in sync).
const COLORS = {
  primary: "#0b63c5",
  accent: "#2ecc71",
  teal: "#22b8cf",
  warning: "#f59e0b",
  muted: "#94a3b8",
  grid: "#e2e8f0",
} as const;

type WeeklyBucket = {
  label: string;
  memberJoins: number;
  pointsIssued: number;
  pointsRedeemed: number;
  messagesInbound: number;
  messagesOutbound: number;
};

// ─── Shared tooltip / axis helpers ───────────────────────────────────────────

function numFmt(value: number) {
  return value >= 1_000 ? `${(value / 1_000).toFixed(1)}k` : String(value);
}

const tooltipStyle: React.CSSProperties = {
  background: "var(--color-surface-elevated, #f9fbff)",
  border: "1px solid var(--color-border, #e2e8f0)",
  borderRadius: 10,
  boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
  fontSize: 12,
};

const axisProps = {
  tick: { fill: "#94a3b8", fontSize: 11 },
  axisLine: false as const,
  tickLine: false as const,
};

// ─── Member growth — area chart ───────────────────────────────────────────────

export function MemberGrowthChart({ series }: { series: WeeklyBucket[] }) {
  return (
    <ResponsiveContainer width="100%" height={180}>
      <AreaChart data={series} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
        <defs>
          <linearGradient id="memberFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={COLORS.primary} stopOpacity={0.18} />
            <stop offset="95%" stopColor={COLORS.primary} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} vertical={false} />
        <XAxis dataKey="label" {...axisProps} />
        <YAxis {...axisProps} tickFormatter={numFmt} allowDecimals={false} />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(value) => [(Number(value ?? 0)).toLocaleString(), "New members"]}
        />
        <Area
          type="monotone"
          dataKey="memberJoins"
          name="New members"
          stroke={COLORS.primary}
          strokeWidth={2}
          fill="url(#memberFill)"
          dot={false}
          activeDot={{ r: 4, strokeWidth: 0 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ─── Points activity — grouped bar chart ─────────────────────────────────────

export function PointsActivityChart({ series }: { series: WeeklyBucket[] }) {
  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={series} margin={{ top: 4, right: 4, left: -24, bottom: 0 }} barCategoryGap="30%">
        <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} vertical={false} />
        <XAxis dataKey="label" {...axisProps} />
        <YAxis {...axisProps} tickFormatter={numFmt} allowDecimals={false} />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(value, name) => [(Number(value ?? 0)).toLocaleString(), String(name)]}
        />
        <Legend
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ fontSize: 11, color: COLORS.muted }}
        />
        <Bar dataKey="pointsIssued" name="Issued" fill={COLORS.accent} radius={[3, 3, 0, 0]} maxBarSize={18} />
        <Bar dataKey="pointsRedeemed" name="Redeemed" fill={COLORS.warning} radius={[3, 3, 0, 0]} maxBarSize={18} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── Conversation volume — dual area chart ────────────────────────────────────

export function MessagesChart({ series }: { series: WeeklyBucket[] }) {
  return (
    <ResponsiveContainer width="100%" height={180}>
      <AreaChart data={series} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
        <defs>
          <linearGradient id="inboundFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={COLORS.teal} stopOpacity={0.18} />
            <stop offset="95%" stopColor={COLORS.teal} stopOpacity={0} />
          </linearGradient>
          <linearGradient id="outboundFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={COLORS.primary} stopOpacity={0.18} />
            <stop offset="95%" stopColor={COLORS.primary} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} vertical={false} />
        <XAxis dataKey="label" {...axisProps} />
        <YAxis {...axisProps} tickFormatter={numFmt} allowDecimals={false} />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(value, name) => [(Number(value ?? 0)).toLocaleString(), String(name)]}
        />
        <Legend
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ fontSize: 11, color: COLORS.muted }}
        />
        <Area
          type="monotone"
          dataKey="messagesInbound"
          name="Inbound"
          stroke={COLORS.teal}
          strokeWidth={2}
          fill="url(#inboundFill)"
          dot={false}
          activeDot={{ r: 4, strokeWidth: 0 }}
        />
        <Area
          type="monotone"
          dataKey="messagesOutbound"
          name="Outbound"
          stroke={COLORS.primary}
          strokeWidth={2}
          fill="url(#outboundFill)"
          dot={false}
          activeDot={{ r: 4, strokeWidth: 0 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ─── Top rewards table ────────────────────────────────────────────────────────

export function TopRewardsTable({ rewards }: { rewards: TopReward[] }) {
  if (!rewards.length) {
    return (
      <p className="py-6 text-center text-sm text-ink-muted">
        No reward redemptions yet for this period.
      </p>
    );
  }

  const max = rewards[0]?.redemptions ?? 1;

  return (
    <ol className="space-y-3">
      {rewards.map((reward, i) => (
        <li key={reward.rewardId} className="flex items-center gap-3">
          <span className="w-5 shrink-0 text-center text-xs font-semibold text-ink-muted">
            {i + 1}
          </span>
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="truncate text-sm font-medium text-ink">{reward.title}</span>
              <span className="shrink-0 text-xs text-ink-muted">
                {reward.redemptions.toLocaleString()}
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-elevated">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${Math.round((reward.redemptions / max) * 100)}%` }}
              />
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}
